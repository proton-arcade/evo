/*
 * Evolution (Web Edition) — sim/creature.js
 * ---------------------------------------------------------------
 * Port of the simulation-side of the original Unity project:
 *   Assets/Scripts/Creature/Creature.cs
 *   Assets/Scripts/Creature/Body/Joint.cs
 *   Assets/Scripts/Creature/Body/Bone.cs
 *   Assets/Scripts/Creature/Body/Muscle.cs
 *   Assets/Scripts/Controllers/CreatureBuilder.cs
 *
 * A creature is a collection of joints (point masses), bones (rigid rods
 * between two joints) and muscles (springs that can contract and expand
 * between two bones).  Wings are bones that generate a lift/drag force
 * perpendicular to their own orientation.
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});
  var Utils = EVO.Utils;

  var JOINT_RADIUS = 0.5;
  var CONNECTION_WIDTH = 0.5;
  /** Muscle springs: Unity's SpringJoint with spring = 1000, damper = 50. */
  var MUSCLE_SPRING_STRENGTH = 1000.0;
  var MUSCLE_SPRING_DAMPER = 50.0;
  /** The maximum muscle force of a muscle with strength 1 (see Muscle.MaxForce). */
  var MAX_MUSCLE_FORCE = 1500.0;

  var MuscleAction = { CONTRACT: 0, EXPAND: 1 };

  /**
   * Creates a creature inside the given physics world.
   */
  function Creature(world, design, options) {
    options = options || {};
    this.world = world;
    this.design = design;
    this.joints = [];
    this.bones = [];
    this.muscles = [];
    this.decorations = [];
    this.brain = null;
    this.alive = false;
    this.usesLegacyRotationCalculation = false;
    this.initialPosition = { x: 0, y: 0 };
    this.maxJumpingHeight = 0;
    this.simulationTimeOverride = 0;
    this.jointIdsWithPenalty = Object.create(null);
    this.containsPenaltyJoints = false;
    this.recordingPlayer = null;
    this.recorder = null;
    this.creatureIndex = options.creatureIndex || 0;
    this.visible = true;
    this.opacity = 1;
    this.wingSpriteVisible = false;
    this.currentTime = 0;
    this.objectiveTracker = null;
    this.scene = options.scene || null;
    this.offsetsApplied = false;
    this.debugName = options.name || design.name || 'Unnamed';

    this._buildJoints();
    this._buildBones();
    this._buildMuscles();
    this._buildDecorations();

    this.initialPosition = { x: this.getXPosition(), y: this.getYPosition() };
  }

  Creature.JOINT_RADIUS = JOINT_RADIUS;
  Creature.CONNECTION_WIDTH = CONNECTION_WIDTH;
  Creature.MUSCLE_SPRING_STRENGTH = MUSCLE_SPRING_STRENGTH;
  Creature.MAX_MUSCLE_FORCE = MAX_MUSCLE_FORCE;
  Creature.MuscleAction = MuscleAction;

  /* ------------------------------------------------------------------ *
   * Construction
   * ------------------------------------------------------------------ */
  Creature.prototype._buildJoints = function () {
    var self = this;
    this.design.joints.forEach(function (data) {
      var body = self.world.addBody({
        x: data.x,
        y: data.y,
        mass: data.weight,
        radius: JOINT_RADIUS,
      });
      body.owner = self;
      var joint = {
        data: data,
        body: body,
        center: { x: data.x, y: data.y },
        isCollidingWithGround: false,
        isCollidingWithObstacle: false,
      };
      body.joint = joint;
      self.joints.push(joint);
    });
  };

  Creature.prototype._findJoint = function (id) {
    for (var i = 0; i < this.joints.length; i++) {
      if (this.joints[i].data.id === id) return this.joints[i];
    }
    return null;
  };

  Creature.prototype._findBone = function (id) {
    for (var i = 0; i < this.bones.length; i++) {
      if (this.bones[i].data.id === id) return this.bones[i];
    }
    return null;
  };

  Creature.prototype._buildBones = function () {
    var self = this;
    this.design.bones.forEach(function (data) {
      var startJoint = self._findJoint(data.startJointID);
      var endJoint = self._findJoint(data.endJointID);
      if (!startJoint || !endJoint) return;

      var restLength = Utils.distance(
        startJoint.body.x,
        startJoint.body.y,
        endJoint.body.x,
        endJoint.body.y
      );
      var constraint = self.world.addConstraint(startJoint.body, endJoint.body, restLength, 1);

      var bone = {
        data: data,
        startJoint: startJoint,
        endJoint: endJoint,
        constraint: constraint,
        mass: data.weight,
        length: restLength,
        halfLength: restLength / 2,
        isWing: !!data.isWing,
        inverted: !!data.inverted,
        direction: { x: 0, y: 1 },
        center: { x: 0, y: 0 },
        angle: 0,
        angularVelocity: 0,
        connectedMuscles: [],
      };
      self.bones.push(bone);

      // The mass of a bone is distributed onto its two joints.
      var halfMass = data.weight / 2;
      startJoint.body.mass += halfMass;
      endJoint.body.mass += halfMass;
      startJoint.body.invMass = 1 / startJoint.body.mass;
      endJoint.body.invMass = 1 / endJoint.body.mass;
    });
  };

  Creature.prototype._buildMuscles = function () {
    var self = this;
    this.design.muscles.forEach(function (data) {
      var startBone = self._findBone(data.startBoneID);
      var endBone = self._findBone(data.endBoneID);
      if (!startBone || !endBone) return;

      self.updateBoneGeometry(startBone);
      self.updateBoneGeometry(endBone);

      var restLength = Utils.distance(
        startBone.center.x,
        startBone.center.y,
        endBone.center.x,
        endBone.center.y
      );

      var muscle = {
        data: data,
        startBone: startBone,
        endBone: endBone,
        restLength: restLength,
        currentForce: 0,
        muscleAction: MuscleAction.CONTRACT,
        living: false,
        shouldShowContraction: false,
      };
      startBone.connectedMuscles.push(muscle);
      endBone.connectedMuscles.push(muscle);
      self.muscles.push(muscle);
    });
  };

  Creature.prototype._buildDecorations = function () {
    var self = this;
    this.design.decorations.forEach(function (data) {
      var bone = self._findBone(data.boneId);
      if (!bone) return;
      self.decorations.push({
        data: data,
        bone: bone,
        offset: data.offset,
        scale: data.scale,
        rotation: data.rotation,
        flipX: data.flipX,
        flipY: data.flipY,
        decorationType: data.decorationType,
      });
    });
  };

  Creature.prototype.updateBoneGeometry = function (bone) {
    var ax = bone.startJoint.body.x;
    var ay = bone.startJoint.body.y;
    var bx = bone.endJoint.body.x;
    var by = bone.endJoint.body.y;
    bone.center.x = (ax + bx) / 2;
    bone.center.y = (ay + by) / 2;
    var dx = bx - ax;
    var dy = by - ay;
    var length = Math.sqrt(dx * dx + dy * dy);
    if (length > 1e-9) {
      bone.direction.x = dx / length;
      bone.direction.y = dy / length;
    } else {
      bone.direction.x = 0;
      bone.direction.y = 1;
    }
    bone.length = length;
    bone.halfLength = length / 2;
    // Unity: transform.up = direction; eulerAngles.z of that rotation.
    bone.angle = Math.atan2(-bone.direction.x, bone.direction.y);
  };

  Creature.prototype.updateGeometry = function (dt) {
    for (var i = 0; i < this.bones.length; i++) {
      var bone = this.bones[i];
      this.updateBoneGeometry(bone);

      // Angular velocity around the z axis: omega = (d x dv) / |d|^2
      var velStartX = bone.startJoint.body.vx;
      var velStartY = bone.startJoint.body.vy;
      var velEndX = bone.endJoint.body.vx;
      var velEndY = bone.endJoint.body.vy;
      var relVelX = velEndX - velStartX;
      var relVelY = velEndY - velStartY;
      var d = bone.direction;
      var lengthSq = bone.length * bone.length;
      if (lengthSq > 1e-9) {
        bone.angularVelocity = (d.x * relVelY - d.y * relVelX) / lengthSq;
      } else {
        bone.angularVelocity = 0;
      }
    }
  };

  /* ------------------------------------------------------------------ *
   * Simulation
   * ------------------------------------------------------------------ */
  Creature.prototype.prepareForEvolution = function () {
    this.alive = true;
    this.maxJumpingHeight = 0;
    this.jointIdsWithPenalty = Object.create(null);
    this.containsPenaltyJoints = false;
    var self = this;
    this.joints.forEach(function (joint) {
      joint.body.fixed = false;
      joint.body.vx = 0;
      joint.body.vy = 0;
      joint.isCollidingWithGround = false;
      joint.isCollidingWithObstacle = false;
      if (joint.data.fitnessPenaltyForTouchingGround > 0) {
        self.containsPenaltyJoints = true;
      }
    });
    this.muscles.forEach(function (muscle) {
      muscle.living = true;
      muscle.currentForce = 0;
    });
  };

  Creature.prototype.update = function (dt) {
    this.currentTime += dt;

    this.updateGeometry(dt);

    if (!this.alive) return;

    // Track the maximum jumping height (used by the stats)
    var lowest = this.getLowestPoint();
    this.maxJumpingHeight = Math.max(this.maxJumpingHeight, lowest.y - this.initialPosition.y);

    if (this.containsPenaltyJoints) {
      for (var i = 0; i < this.joints.length; i++) {
        var joint = this.joints[i];
        if (joint.data.fitnessPenaltyForTouchingGround > 0 && joint.isCollidingWithGround) {
          this.jointIdsWithPenalty[joint.data.id] = true;
        }
      }
    }

    if (this.objectiveTracker) {
      this.objectiveTracker.fixedUpdate(dt);
    }
  };

  /** Synchronizes the collision flags from the physics bodies. */
  Creature.prototype.syncContacts = function () {
    for (var i = 0; i < this.joints.length; i++) {
      var joint = this.joints[i];
      joint.isCollidingWithGround = joint.body.touchingGround;
      joint.isCollidingWithObstacle = joint.body.touchingObstacle;
    }
  };

  /**
   * Applied at the beginning of every physics substep.
   * This is the port of Muscle.FixedUpdate and Bone.FixedUpdate.
   */
  Creature.prototype.applyForces = function (world, dt) {
    if (!this.alive) return;

    for (var i = 0; i < this.muscles.length; i++) {
      this.applyMuscleForces(this.muscles[i]);
    }

    for (var b = 0; b < this.bones.length; b++) {
      if (this.bones[b].isWing) {
        this.applyWingForce(this.bones[b]);
      }
    }
  };

  Creature.prototype.applyMuscleForces = function (muscle) {
    if (!muscle.living) return;

    var startBone = muscle.startBone;
    var endBone = muscle.endBone;

    var dx = endBone.center.x - startBone.center.x;
    var dy = endBone.center.y - startBone.center.y;
    var distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 1e-6) return;

    var nx = dx / distance;
    var ny = dy / distance;

    // `force` is the scalar force that is applied to the START bone along +n
    // (the END bone receives the opposite force).  A positive value therefore
    // pulls the two bones towards each other.

    // --- Passive spring (Unity's SpringJoint between the two bone centres) ---
    var extension = distance - muscle.restLength;
    var force = MUSCLE_SPRING_STRENGTH * extension;

    // Damping along the muscle axis: relative movement of the two bone
    // centres along the axis of the muscle.
    var relativeVelocityX = (endBone.centerVelocityX || 0) - (startBone.centerVelocityX || 0);
    var relativeVelocityY = (endBone.centerVelocityY || 0) - (startBone.centerVelocityY || 0);
    var axialVelocity = relativeVelocityX * nx + relativeVelocityY * ny;
    force += MUSCLE_SPRING_DAMPER * axialVelocity;

    // --- Active force (Muscle.Contract / Muscle.Expand) ---
    if (muscle.muscleAction === MuscleAction.CONTRACT) {
      // Pull the two bones towards each other.
      force += muscle.currentForce;
    } else if (muscle.data.canExpand) {
      // Push the two bones apart.
      force -= muscle.currentForce;
    }

    // The force acts on both bones, along the muscle axis, distributed
    // equally onto the two joints of each bone (no net torque).
    applyBoneForce(startBone, nx * force * 0.5, ny * force * 0.5);
    applyBoneForce(endBone, -nx * force * 0.5, -ny * force * 0.5);
  };

  /**
   * Port of Bone.FixedUpdate — the wings generate a force perpendicular to
   * their own orientation, based on their velocity in their local frame.
   */
  Creature.prototype.applyWingForce = function (bone) {
    if (!bone.isWing) return;

    var centerVelocityX = (bone.startJoint.body.vx + bone.endJoint.body.vx) / 2;
    var centerVelocityY = (bone.startJoint.body.vy + bone.endJoint.body.vy) / 2;

    // Local frame: local +y is the bone direction, local +x the perpendicular.
    var rightX = Math.cos(bone.angle);
    var rightY = Math.sin(bone.angle);

    var localVelocityX = centerVelocityX * rightX + centerVelocityY * rightY;
    // The local +y axis in world space is the bone direction.
    var localVelocityY = centerVelocityX * bone.direction.x + centerVelocityY * bone.direction.y;

    var speed = Math.sqrt(localVelocityX * localVelocityX + localVelocityY * localVelocityY);
    if (speed < 1.0) return;

    // Signed angle between the local velocity and the local up vector (0, 1).
    var cross = localVelocityX * 1 - localVelocityY * 0; // cross(v, up).z
    var dot = localVelocityX * 0 + localVelocityY * 1;
    var localAngle = Math.atan2(cross, dot) * Utils.Rad2Deg;

    if (bone.data.inverted !== (localAngle < 0)) {
      // We make it easier to move the wing up by not generating any opposing force.
      return;
    }

    var maxForce = 30.0 * bone.halfLength;
    var angleFactor = 1.0 - Math.abs(Math.abs(localAngle) - 90.0) / 90.0;
    var velocityFactor = speed;
    var force = velocityFactor * -Utils.sign(localAngle) * maxForce * angleFactor;

    applyBoneForce(bone, rightX * force * 0.5, rightY * force * 0.5);
  };

  /** Distributes a force (already halved) onto both joints of a bone. */
  function applyBoneForce(bone, fx, fy) {
    bone.startJoint.body.fx += fx;
    bone.startJoint.body.fy += fy;
    bone.endJoint.body.fx += fx;
    bone.endJoint.body.fy += fy;
  }

  /**
   * Updates the velocities of the bone centres (used for the muscle damping).
   * Called once per simulation tick after the physics substeps.
   */
  Creature.prototype.updateBoneVelocities = function () {
    for (var i = 0; i < this.bones.length; i++) {
      var bone = this.bones[i];
      bone.centerVelocityX = (bone.startJoint.body.vx + bone.endJoint.body.vx) / 2;
      bone.centerVelocityY = (bone.startJoint.body.vy + bone.endJoint.body.vy) / 2;
    }
  };

  /* ------------------------------------------------------------------ *
   * Brain interface
   * ------------------------------------------------------------------ */
  Creature.prototype.updateBrain = function (dt) {
    if (this.brain && this.alive && !this.recordingPlayer) {
      this.brain.update(dt);
    }
  };

  /* ------------------------------------------------------------------ *
   * Recording playback (the best creatures of previous generations)
   * ------------------------------------------------------------------ */
  Creature.prototype.setRecordingPlayer = function (player) {
    this.recordingPlayer = player;
    if (player) {
      // Kinematic playback: the joints are moved directly.
      for (var i = 0; i < this.joints.length; i++) {
        this.joints[i].body.fixed = true;
      }
    } else {
      for (var j = 0; j < this.joints.length; j++) {
        this.joints[j].body.fixed = false;
      }
    }
  };

  Creature.prototype.updateRecordingPlayback = function (time) {
    if (!this.recordingPlayer) return;
    this.recordingPlayer.seekPlaybackToAbsoluteTime(time);
    for (var i = 0; i < this.joints.length; i++) {
      var position = this.recordingPlayer.getRecordedJointPosition(i);
      this.joints[i].body.x = position.x;
      this.joints[i].body.y = position.y;
      this.joints[i].body.vx = 0;
      this.joints[i].body.vy = 0;
    }
    for (var m = 0; m < this.muscles.length; m++) {
      var signedForce = this.recordingPlayer.getRecordedMuscleForce(m);
      this.muscles[m].muscleAction = signedForce >= 0 ? MuscleAction.CONTRACT : MuscleAction.EXPAND;
      this.muscles[m].currentForce = Math.abs(signedForce);
    }
    this.updateGeometry(1 / 60);
  };

  Creature.prototype.createRecorder = function (recordingDurationInSeconds) {
    this.recorder = new EVO.CreatureRecorder(
      recordingDurationInSeconds,
      this.joints.length,
      this.muscles.length
    );
    return this.recorder;
  };

  Creature.prototype.recordSample = function () {
    if (!this.recorder) return;
    if (this.recorder.currentSampleIndex >= this.recorder.sampleCount) return;
    var jointPositions = [];
    for (var i = 0; i < this.joints.length; i++) {
      jointPositions.push({ x: this.joints[i].body.x, y: this.joints[i].body.y });
    }
    var muscleForces = [];
    for (var m = 0; m < this.muscles.length; m++) {
      var signedForce = this.muscles[m].currentForce;
      if (this.muscles[m].muscleAction === MuscleAction.EXPAND) {
        signedForce *= -1;
      }
      muscleForces.push(signedForce);
    }
    this.recorder.recordSample(this.currentTime, jointPositions, muscleForces);
  };

  /* ------------------------------------------------------------------ *
   * Queries (port of the Creature.cs helper methods)
   * ------------------------------------------------------------------ */
  Creature.prototype.getStatistics = function (simulationTime) {
    var stats = EVO.CreatureStats.create();

    var fitness = this.objectiveTracker
      ? this.objectiveTracker.evaluateFitness(simulationTime)
      : 0;

    // Apply the fitness penalty for joints that touched the ground.
    var penaltyIndices = Object.keys(this.jointIdsWithPenalty);
    if (penaltyIndices.length > 0) {
      for (var i = 0; i < this.joints.length; i++) {
        var joint = this.joints[i];
        if (this.jointIdsWithPenalty[joint.data.id]) {
          fitness -= joint.data.fitnessPenaltyForTouchingGround;
        }
      }
    }
    fitness = Math.max(0, fitness);

    stats.unclampedFitness = fitness;
    stats.fitness = Utils.clamp(fitness, 0, 1);
    stats.horizontalDistanceTravelled = this.getXPosition() - this.initialPosition.x;
    stats.verticalDistanceTravelled = this.getYPosition() - this.initialPosition.y;
    stats.averageSpeed = Math.sqrt(
      Math.pow(stats.horizontalDistanceTravelled / simulationTime, 2) +
        Math.pow(stats.verticalDistanceTravelled / simulationTime, 2)
    );
    stats.numberOfBones = this.bones.length;
    stats.numberOfMuscles = this.muscles.length;
    stats.simulationTime = Math.round(simulationTime);
    var weight = 0;
    for (var j = 0; j < this.joints.length; j++) {
      weight += this.joints[j].data.weight;
    }
    for (var b = 0; b < this.bones.length; b++) {
      weight += this.bones[b].data.weight;
    }
    stats.weight = weight;
    stats.maxJumpingHeight = this.maxJumpingHeight;

    return stats;
  };

  Creature.prototype.calculateBasicBrainInputs = function () {
    var joints = this.joints;
    var minJointY = joints.length ? joints[0].body.y : 0;
    var maxJointY = minJointY;
    var velocityX = 0;
    var velocityY = 0;
    var angularVelZ = 0;
    var jointsCountTouchingGround = 0;
    var rotationZ = 0;

    var jointCount = joints.length;
    var boneCount = this.bones.length;

    for (var i = 0; i < jointCount; i++) {
      var body = joints[i].body;
      if (body.y > maxJointY) maxJointY = body.y;
      else if (body.y < minJointY) minJointY = body.y;

      velocityX += body.vx;
      velocityY += body.vy;

      jointsCountTouchingGround += joints[i].isCollidingWithGround ? 1 : 0;
    }

    for (var b = 0; b < boneCount; b++) {
      var bone = this.bones[b];
      angularVelZ += bone.angularVelocity;

      if (this.usesLegacyRotationCalculation) {
        rotationZ += bone.angle;
      } else {
        // (eulerAngles.z - 180) * 1/360
        var degrees = Utils.repeat(bone.angle * Utils.Rad2Deg, 360);
        rotationZ += (degrees - 180) * 0.002778;
      }
    }

    var distFromFloor = minJointY;
    if (jointCount > 0) {
      velocityX /= jointCount;
      velocityY /= jointCount;
    }
    if (boneCount > 0) {
      angularVelZ /= boneCount;
      rotationZ /= boneCount;
    }

    return {
      DistanceFromFloor: distFromFloor,
      VelocityX: velocityX,
      VelocityY: velocityY,
      AngularVelocity: angularVelZ,
      PointsTouchingGroundCount: jointsCountTouchingGround,
      Rotation: rotationZ,
    };
  };

  Creature.prototype.raycastDistance = function (origin, direction, maxDistance, mask) {
    if (maxDistance === undefined) maxDistance = Infinity;
    var hit = this.world.raycast(origin.x, origin.y, direction.x, direction.y, maxDistance, mask);
    return hit ? hit.distance : 0;
  };

  Creature.prototype.distanceFromGround = function (position) {
    var origin = position || this.getLowestPoint();
    var hit = this.world.raycast(origin.x, origin.y + 0.05, 0, -1, Infinity, ['static']);
    if (!hit) return 0;
    return Math.max(0, hit.distance - 0.05);
  };

  Creature.prototype.semiSafeDistanceFromGround = function (sceneContainsStairs) {
    var jointCount = Math.min(5, this.joints.length);
    var sorted = this.joints.slice().sort(function (lhs, rhs) {
      return lhs.body.y - rhs.body.y;
    });
    var minDistance = Infinity;
    for (var i = 0; i < jointCount; i++) {
      var distance = this.distanceFromGround({ x: sorted[i].body.x, y: sorted[i].body.y });
      minDistance = Math.min(minDistance, distance);
    }
    if (sceneContainsStairs && this.joints.length > 0) {
      var sin45 = Math.sin(-0.25 * Math.PI);
      var cos45 = Math.cos(-0.25 * Math.PI);
      var lowestIndex = 0;
      var lowestY = Infinity;
      for (var j = 0; j < this.joints.length; j++) {
        var body = this.joints[j].body;
        var rotatedY = body.y * cos45 + body.x * sin45;
        if (rotatedY < lowestY) {
          lowestY = rotatedY;
          lowestIndex = j;
        }
      }
      var position = this.joints[lowestIndex].body;
      var stairHeight = 3.36 + position.x;
      minDistance = Math.min(minDistance, position.y - stairHeight);
    }
    return minDistance;
  };

  /**
   * Moves the creature upwards until none of its joints overlaps the static
   * geometry.  Used when placing a creature so that it can never spawn inside
   * the ground (which would make the physics explode).
   */
  Creature.prototype.resolveStaticOverlap = function (maxIterations) {
    maxIterations = maxIterations || 40;
    if (!this.scene || !this.scene.world) return;
    for (var iteration = 0; iteration < maxIterations; iteration++) {
      var push = 0;
      for (var i = 0; i < this.joints.length; i++) {
        var body = this.joints[i].body;
        var penetration = this.scene.world.staticPenetration(body.x, body.y, body.radius);
        if (penetration > push) push = penetration;
      }
      if (push <= 0.001) return;
      this.translate(0, push + 0.01);
    }
  };

  Creature.prototype.getVelocity = function () {
    if (this.joints.length === 0) return { x: 0, y: 0 };
    var x = 0,
      y = 0;
    for (var i = 0; i < this.joints.length; i++) {
      x += this.joints[i].body.vx;
      y += this.joints[i].body.vy;
    }
    return { x: x / this.joints.length, y: y / this.joints.length };
  };

  Creature.prototype.getAngularVelocity = function () {
    if (this.bones.length === 0) return 0;
    var total = 0;
    for (var i = 0; i < this.bones.length; i++) {
      total += this.bones[i].angularVelocity;
    }
    return total / this.bones.length;
  };

  Creature.prototype.getNumberOfPointsTouchingGround = function () {
    var count = 0;
    for (var i = 0; i < this.joints.length; i++) {
      count += this.joints[i].isCollidingWithGround ? 1 : 0;
    }
    return count;
  };

  Creature.prototype.addObstacleCollidingJointsToSet = function (set) {
    for (var i = 0; i < this.joints.length; i++) {
      if (this.joints[i].isCollidingWithObstacle) {
        set.add(this.joints[i]);
      }
    }
  };

  Creature.prototype.getRotation = function () {
    if (this.bones.length === 0) return 0;
    var rotation = 0;
    for (var i = 0; i < this.bones.length; i++) {
      var bone = this.bones[i];
      if (this.usesLegacyRotationCalculation) {
        rotation += bone.angle;
      } else {
        rotation += (Utils.repeat(bone.angle * Utils.Rad2Deg, 360) - 180) * 0.002778;
      }
    }
    return rotation / this.bones.length;
  };

  Creature.prototype.getXPosition = function () {
    var total = 0;
    for (var i = 0; i < this.joints.length; i++) {
      total += this.joints[i].body.x;
    }
    return this.joints.length === 0 ? 0 : total / this.joints.length;
  };

  Creature.prototype.getYPosition = function () {
    var total = 0;
    for (var i = 0; i < this.joints.length; i++) {
      total += this.joints[i].body.y;
    }
    return this.joints.length === 0 ? 0 : total / this.joints.length;
  };

  Creature.prototype.getLowestPoint = function () {
    if (this.joints.length === 0) return { x: 0, y: 0 };
    var min = this.joints[0].body;
    for (var i = 1; i < this.joints.length; i++) {
      if (this.joints[i].body.y < min.y) min = this.joints[i].body;
    }
    return { x: min.x, y: min.y };
  };

  Creature.prototype.getHighestPoint = function () {
    if (this.joints.length === 0) return { x: 0, y: 0 };
    var max = this.joints[0].body;
    for (var i = 1; i < this.joints.length; i++) {
      if (this.joints[i].body.y > max.y) max = this.joints[i].body;
    }
    return { x: max.x, y: max.y };
  };

  /**
   * The currently active obstacle of the scene (used by the legacy brain):
   * the next block of the obstacle course that is still ahead of the creature
   * or the first rolling obstacle of a legacy scene.
   */
  Creature.prototype.getObstacle = function () {
    return this.scene ? this.scene.getObstacle(this.getXPosition()) : null;
  };

  Creature.prototype.getDistanceFromObstacle = function (obstacle) {
    if (!obstacle) return Infinity;
    var minDistance = Infinity;
    for (var i = 0; i < this.joints.length; i++) {
      var distance = Utils.distance(
        this.joints[i].body.x,
        this.joints[i].body.y,
        obstacle.x,
        obstacle.y
      );
      minDistance = Math.min(minDistance, distance);
    }
    return minDistance;
  };

  /** Moves the whole creature so that its lowest point sits `height` above the ground. */
  Creature.prototype.setPosition = function (x, y) {
    var currentX = this.getXPosition();
    var currentY = this.getYPosition();
    var dx = x - currentX;
    var dy = y - currentY;
    this.translate(dx, dy);
  };

  Creature.prototype.translate = function (dx, dy) {
    for (var i = 0; i < this.joints.length; i++) {
      var body = this.joints[i].body;
      body.x += dx;
      body.y += dy;
      body._prevX += dx;
      body._prevY += dy;
    }
    this.updateGeometry(0);
  };

  /** Deprecated helper kept for API compatibility with the editor preview. */
  Creature.prototype.setKinematic = function (enabled) {
    for (var i = 0; i < this.joints.length; i++) {
      this.joints[i].body.fixed = !!enabled;
    }
  };

  EVO.Creature = Creature;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
