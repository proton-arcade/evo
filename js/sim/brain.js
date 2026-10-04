/*
 * Evolution (Web Edition) — sim/brain.js
 * ---------------------------------------------------------------
 * Port of the brains and the objective trackers of the original:
 *   Assets/Scripts/Creature/Brains/*.cs
 *   Assets/Scripts/Util/*ObjectiveTracker.cs
 *
 * The "Universal" brain is used for all new simulations.  It receives 11
 * input values (six distance sensor readings and five proprioceptive values)
 * and produces one output per unique muscle id plus one additional output
 * that rotates the direction of the custom distance sensor.
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});
  var Utils = EVO.Utils;

  var BrainType = {
    Universal: 0,
    LegacyRunningBrain: 1,
    LegacyJumpingBrain: 2,
    LegacyObstacleJumpBrain: 3,
    LegacyClimbingBrain: 4,
  };

  /* ------------------------------------------------------------------ *
   * Brain
   * ------------------------------------------------------------------ */
  function Brain(creature) {
    this.creature = creature;
    this.network = null;
    this.muscles = [];
    this.muscleToOutputIndex = [];
    this.numberOfUniqueMuscleIds = 0;
    this.additionalOutputs = 0;
    this.numberOfInputs = 0;
  }

  Brain.prototype.getNumberOfOutputs = function () {
    return this.numberOfUniqueMuscleIds + this.additionalOutputs;
  };

  Brain.prototype.init = function (networkSettings, muscles, uniqueMusclesContext, chromosome) {
    this.muscles = muscles;
    this.muscleToOutputIndex = uniqueMusclesContext.muscleToOutputIndex;
    this.numberOfUniqueMuscleIds = uniqueMusclesContext.numberOfUniqueMuscleIds;

    this.network = new EVO.FeedForwardNetwork(
      this.numberOfInputs,
      this.getNumberOfOutputs(),
      networkSettings,
      chromosome
    );
  };

  Brain.prototype.update = function (dt) {
    if (!this.network || !this.creature.alive || this.creature.recordingPlayer) return;
    this.updateInputs();
    var outputs = this.network.calculateOutputs();
    this.applyOutputs(outputs);
  };

  Brain.prototype.applyOutputs = function (outputs) {
    for (var i = 0; i < this.muscles.length; i++) {
      var outputIndex = this.muscleToOutputIndex[i];
      var output = outputs[outputIndex];
      if (isNaN(output)) output = 0;
      this.applyOutputToMuscle(output, this.muscles[i]);
    }
  };

  Brain.prototype.applyOutputToMuscle = function (output, muscle) {
    // Maps the sigmoid output from [0, 1] to a range of [-1, 1].
    var percent = 2 * output - 1;
    if (percent < 0) {
      muscle.muscleAction = EVO.Creature.MuscleAction.CONTRACT;
    } else {
      muscle.muscleAction = EVO.Creature.MuscleAction.EXPAND;
    }
    this.setContractionForce(muscle, Math.abs(percent));
  };

  Brain.prototype.setContractionForce = function (muscle, percent) {
    var maxForce = muscle.data.strength;
    muscle.currentForce = Math.max(0.01, Math.min(maxForce, percent * maxForce));
  };

  Brain.prototype.toChromosomeString = function () {
    return this.network.toBinaryString();
  };

  /* --- Legacy brains (6 inputs, used for simulations started with v2) --- */
  function SimpleBrain(creature, numberOfInputs) {
    Brain.call(this, creature);
    this.numberOfInputs = numberOfInputs;
  }
  SimpleBrain.prototype = Object.create(Brain.prototype);
  SimpleBrain.prototype.constructor = SimpleBrain;

  SimpleBrain.prototype.updateInputs = function () {
    var inputs = this.network.inputs;
    var basicInputs = this.creature.calculateBasicBrainInputs();
    inputs[0] = basicInputs.DistanceFromFloor;
    inputs[1] = basicInputs.VelocityX;
    inputs[2] = basicInputs.VelocityY;
    inputs[3] = basicInputs.AngularVelocity;
    inputs[4] = basicInputs.PointsTouchingGroundCount;
    inputs[5] = basicInputs.Rotation;
  };

  function RunningBrain(creature) {
    SimpleBrain.call(this, creature, 6);
  }
  RunningBrain.prototype = Object.create(SimpleBrain.prototype);

  function JumpingBrain(creature) {
    SimpleBrain.call(this, creature, 6);
  }
  JumpingBrain.prototype = Object.create(SimpleBrain.prototype);
  JumpingBrain.prototype.updateInputs = function () {
    var inputs = this.network.inputs;
    inputs[0] = this.creature.distanceFromGround();
    var velocity = this.creature.getVelocity();
    inputs[1] = velocity.x;
    inputs[2] = velocity.y;
    inputs[3] = this.creature.getAngularVelocity();
    inputs[4] = this.creature.getNumberOfPointsTouchingGround();
    inputs[5] = this.creature.getRotation();
  };

  function ClimbingBrain(creature) {
    JumpingBrain.call(this, creature);
    this.numberOfInputs = 6;
  }
  ClimbingBrain.prototype = Object.create(JumpingBrain.prototype);

  function ObstacleJumpingBrain(creature) {
    JumpingBrain.call(this, creature);
    this.numberOfInputs = 7;
    this.obstacle = null;
  }
  ObstacleJumpingBrain.prototype = Object.create(JumpingBrain.prototype);
  ObstacleJumpingBrain.prototype.updateInputs = function () {
    JumpingBrain.prototype.updateInputs.call(this);
    if (!this.obstacle) {
      this.obstacle = this.creature.getObstacle();
    }
    this.network.inputs[6] = this.creature.getDistanceFromObstacle(this.obstacle);
  };

  /* --- The universal brain ------------------------------------------- */
  function UniversalBrain(creature) {
    Brain.call(this, creature);
    this.numberOfInputs = UniversalBrain.NUMBER_OF_INPUTS;
    this.additionalOutputs = UniversalBrain.NUMBER_OF_ADDITIONAL_OUTPUTS;
    this.customRaycastAngle = 0;
  }
  UniversalBrain.prototype = Object.create(Brain.prototype);

  UniversalBrain.NUMBER_OF_INPUTS = 11;
  UniversalBrain.NUMBER_OF_ADDITIONAL_OUTPUTS = 1;
  UniversalBrain.MAX_RAYCAST_DISTANCE = 20;
  UniversalBrain.ANGLE_SMOOTHING_WEIGHT = 0.1;

  UniversalBrain.prototype.updateInputs = function () {
    var creature = this.creature;
    var inputs = this.network.inputs;
    var basicInputs = creature.calculateBasicBrainInputs();

    var center = { x: creature.getXPosition(), y: creature.getYPosition() };

    inputs[0] = creature.distanceFromGround();
    inputs[1] = creature.raycastDistance(center, { x: 1, y: 0 }, UniversalBrain.MAX_RAYCAST_DISTANCE);
    inputs[2] = creature.raycastDistance(center, { x: 1, y: -1 }, UniversalBrain.MAX_RAYCAST_DISTANCE);
    inputs[3] = creature.raycastDistance(center, { x: -1, y: -1 }, UniversalBrain.MAX_RAYCAST_DISTANCE);
    inputs[4] = creature.raycastDistance(center, { x: -1, y: 0 }, UniversalBrain.MAX_RAYCAST_DISTANCE);

    var direction = {
      x: Math.cos(this.customRaycastAngle),
      y: Math.sin(this.customRaycastAngle),
    };
    inputs[5] = creature.raycastDistance(center, direction, UniversalBrain.MAX_RAYCAST_DISTANCE);

    inputs[6] = basicInputs.VelocityX;
    inputs[7] = basicInputs.VelocityY;
    inputs[8] = basicInputs.AngularVelocity;
    inputs[9] = basicInputs.PointsTouchingGroundCount;
    inputs[10] = basicInputs.Rotation;
  };

  UniversalBrain.prototype.applyOutputs = function (outputs) {
    Brain.prototype.applyOutputs.call(this, outputs);
    var newRaycastAngle = outputs[outputs.length - 1] * 2 * Math.PI;
    this.customRaycastAngle =
      UniversalBrain.ANGLE_SMOOTHING_WEIGHT * newRaycastAngle +
      (1 - UniversalBrain.ANGLE_SMOOTHING_WEIGHT) * this.customRaycastAngle;
  };

  /* ------------------------------------------------------------------ *
   * Unique muscles context (Brain.CalculateUniqueMusclesContext)
   * ------------------------------------------------------------------ */
  function calculateUniqueMusclesContext(muscles) {
    var numberOfUniqueMuscleIds = 0;
    var muscleToOutputIndex = new Array(muscles.length);
    // User-supplied muscle ids can be strings like "__proto__" or "constructor".
    // A null-prototype map keeps those ids from colliding with Object.prototype.
    var userIdToIndex = Object.create(null);

    for (var i = 0; i < muscles.length; i++) {
      var muscle = muscles[i];
      var outputIndex = numberOfUniqueMuscleIds;
      if (!muscle.userId) {
        numberOfUniqueMuscleIds++;
      } else {
        if (userIdToIndex[muscle.userId] === undefined) {
          outputIndex = numberOfUniqueMusclesIdAssign(userIdToIndex, muscle.userId, numberOfUniqueMuscleIds);
          numberOfUniqueMuscleIds++;
        } else {
          outputIndex = userIdToIndex[muscle.userId];
        }
      }
      muscleToOutputIndex[i] = outputIndex;
    }

    return {
      numberOfUniqueMuscleIds: numberOfUniqueMuscleIds,
      muscleToOutputIndex: muscleToOutputIndex,
    };
  }

  function numberOfUniqueMusclesIdAssign(map, userId, index) {
    map[userId] = index;
    return index;
  }

  /* ------------------------------------------------------------------ *
   * Objective trackers
   * ------------------------------------------------------------------ */
  var ObjectiveTracker = {
    create: function (objective, creature) {
      switch (objective) {
        case EVO.Objective.Running:
          return new RunningObjectiveTracker(creature);
        case EVO.Objective.Jumping:
          return new JumpingObjectiveTracker(creature);
        case EVO.Objective.ObstacleJump:
          return new ObstacleJumpObjectiveTracker(creature);
        case EVO.Objective.Climbing:
          return new ClimbingObjectiveTracker(creature);
        case EVO.Objective.Flying:
          return new FlyingObjectiveTracker(creature);
      }
      return new RunningObjectiveTracker(creature);
    },
  };

  function RunningObjectiveTracker(creature) {
    this.creature = creature;
  }
  /** The optimal distance a perfect creature could travel in 10 seconds. */
  RunningObjectiveTracker.MAX_DISTANCE = 55;

  RunningObjectiveTracker.prototype.fixedUpdate = function () {};

  RunningObjectiveTracker.prototype.evaluateFitness = function (simulationTime) {
    return (
      (this.creature.getXPosition() - this.creature.initialPosition.x) /
      (RunningObjectiveTracker.MAX_DISTANCE * simulationTime)
    );
  };

  function JumpingObjectiveTracker(creature) {
    this.creature = creature;
    this.maxHeightJumped = 0;
    this.maxWeightedAverageHeight = 0;
  }
  JumpingObjectiveTracker.MAX_HEIGHT = 20;

  JumpingObjectiveTracker.prototype.fixedUpdate = function () {
    var creature = this.creature;
    var distanceFromGround = creature.distanceFromGround();
    var maxHeight =
      creature.getHighestPoint().y - creature.getLowestPoint().y + distanceFromGround;
    this.maxHeightJumped = Math.max(distanceFromGround, this.maxHeightJumped);
    this.maxWeightedAverageHeight = Math.max(
      (4 * distanceFromGround + maxHeight) / 5,
      this.maxWeightedAverageHeight
    );
  };

  JumpingObjectiveTracker.prototype.evaluateFitness = function () {
    return this.maxWeightedAverageHeight / JumpingObjectiveTracker.MAX_HEIGHT;
  };

  function ClimbingObjectiveTracker(creature) {
    this.creature = creature;
  }
  ClimbingObjectiveTracker.MAX_HEIGHT = 100;

  ClimbingObjectiveTracker.prototype.fixedUpdate = function () {};

  ClimbingObjectiveTracker.prototype.evaluateFitness = function (simulationTime) {
    var maxHeight = (ClimbingObjectiveTracker.MAX_HEIGHT * simulationTime) / 10;
    var verticalDistanceFromSpawn = this.creature.getYPosition() - this.creature.initialPosition.y;
    return verticalDistanceFromSpawn / maxHeight + 0.5;
  };

  function FlyingObjectiveTracker(creature) {
    this.creature = creature;
    this.maxHeightJumped = 0;
    this.totalFrameCount = 0;
    this.framesSpentNotTouchingGround = 0;
    this.settledOnGround = false;
    this.currentAirborneTime = 0;
    this.totalAirborneTime = 0;
    this.maxSustainedAirborneTime = 0;
    this.totalAirborneHeight = 0;
  }
  FlyingObjectiveTracker.MAX_HEIGHT = 40;

  FlyingObjectiveTracker.prototype.fixedUpdate = function (dt) {
    var creature = this.creature;
    var touchingGroundCount = creature.getNumberOfPointsTouchingGround();
    if (!this.settledOnGround) {
      // Ignore the initial drop from the spawn position. Start measuring only
      // after at least one ground contact proves the creature has settled.
      if (touchingGroundCount > 0) this.settledOnGround = true;
      return;
    }

    this.totalFrameCount += 1;
    if (touchingGroundCount > 0) {
      this.currentAirborneTime = 0;
      return;
    }

    var distanceFromGround = Math.max(0, creature.distanceFromGround());
    this.maxHeightJumped = Math.max(distanceFromGround, this.maxHeightJumped);
    this.framesSpentNotTouchingGround += 1;
    this.totalAirborneHeight += distanceFromGround;
    this.currentAirborneTime += dt || 0;
    this.totalAirborneTime += dt || 0;
    this.maxSustainedAirborneTime = Math.max(
      this.maxSustainedAirborneTime,
      this.currentAirborneTime
    );
  };

  FlyingObjectiveTracker.prototype.evaluateFitness = function (simulationTime) {
    if (!this.settledOnGround || this.totalFrameCount === 0) return 0;
    simulationTime = Math.max(0.001, simulationTime || 0);
    var durationScale = Math.min(1, simulationTime / 10.0);
    var maxHeightFitness = Utils.clamp(
      (this.maxHeightJumped / FlyingObjectiveTracker.MAX_HEIGHT) * durationScale,
      0,
      1
    );
    var averageAirborneHeight = this.framesSpentNotTouchingGround
      ? this.totalAirborneHeight / this.framesSpentNotTouchingGround
      : 0;
    var averageHeightFitness = Utils.clamp(
      (averageAirborneHeight / FlyingObjectiveTracker.MAX_HEIGHT) * durationScale,
      0,
      1
    );
    var airtimeFitness = this.framesSpentNotTouchingGround / this.totalFrameCount;
    var sustainedAirtimeFitness = Utils.clamp(
      this.maxSustainedAirborneTime / simulationTime,
      0,
      1
    );

    // Max height still matters, but average airborne height and continuous
    // airtime make a brief jump less valuable than controlled sustained flight.
    return Utils.clamp(
      0.2 * maxHeightFitness +
        0.1 * averageHeightFitness +
        0.35 * airtimeFitness +
        0.35 * sustainedAirtimeFitness,
      0,
      1
    );
  };

  function ObstacleJumpObjectiveTracker(creature) {
    this.creature = creature;
    this.collisionDurations = new Map();
    this.collidedJoints = new Set();
    this.maxHeightJumped = 0;
    this.blocks = creature.scene && Array.isArray(creature.scene.blocks) ? creature.scene.blocks : [];
    this.passedBlockIndices = Object.create(null);
    this.passedBlockCount = 0;
    this.initialX = creature.initialPosition ? creature.initialPosition.x : creature.getXPosition();
    this.maxForwardX = this.getLeadingEdgeX();
  }
  ObstacleJumpObjectiveTracker.MAX_HEIGHT = 20;
  ObstacleJumpObjectiveTracker.MAX_COLLISION_DURATION_PER_JOINT = 0.4;

  ObstacleJumpObjectiveTracker.prototype.getLeadingEdgeX = function () {
    var joints = this.creature.joints || [];
    var maxX = -Infinity;
    for (var i = 0; i < joints.length; i++) {
      var body = joints[i].body || joints[i];
      maxX = Math.max(maxX, body.x + (body.radius || 0));
    }
    return maxX === -Infinity ? this.creature.getXPosition() : maxX;
  };

  ObstacleJumpObjectiveTracker.prototype.getTrailingEdgeX = function () {
    var joints = this.creature.joints || [];
    var minX = Infinity;
    for (var i = 0; i < joints.length; i++) {
      var body = joints[i].body || joints[i];
      minX = Math.min(minX, body.x - (body.radius || 0));
    }
    return minX === Infinity ? this.creature.getXPosition() : minX;
  };

  ObstacleJumpObjectiveTracker.prototype.fixedUpdate = function (dt) {
    var creature = this.creature;
    this.maxHeightJumped = Math.max(creature.distanceFromGround(), this.maxHeightJumped);

    if (this.blocks.length) {
      this.maxForwardX = Math.max(this.maxForwardX, this.getLeadingEdgeX());
      var trailingEdgeX = this.getTrailingEdgeX();
      for (var i = 0; i < this.blocks.length; i++) {
        if (this.passedBlockIndices[i]) continue;
        var block = this.blocks[i];
        var rightEdge = block.right === undefined ? block.x + block.width / 2 : block.right;
        // Count a block only after the whole creature has cleared its far edge.
        if (trailingEdgeX > rightEdge + 0.05) {
          this.passedBlockIndices[i] = true;
          this.passedBlockCount++;
        }
      }
    }

    creature.addObstacleCollidingJointsToSet(this.collidedJoints);
    var self = this;
    this.collidedJoints.forEach(function (joint) {
      var duration = self.collisionDurations.get(joint) || 0;
      duration += dt;
      self.collisionDurations.set(joint, duration);
    });
    this.collidedJoints.clear();
  };

  ObstacleJumpObjectiveTracker.prototype.evaluateFitness = function () {
    var heightFitness = Utils.clamp(
      this.maxHeightJumped / ObstacleJumpObjectiveTracker.MAX_HEIGHT,
      0,
      1
    );
    var totalCollisionDuration = 0;
    this.collisionDurations.forEach(function (duration) {
      totalCollisionDuration += duration;
    });
    var jointCount = this.creature.joints ? this.creature.joints.length : 0;
    var averageCollisionDuration = jointCount ? totalCollisionDuration / jointCount : 0;

    var collisionFitness =
      1 -
      Utils.clamp(
        averageCollisionDuration / ObstacleJumpObjectiveTracker.MAX_COLLISION_DURATION_PER_JOINT,
        0,
        1
      );

    if (this.blocks.length) {
      var passedFitness = this.passedBlockCount / this.blocks.length;
      var lastBlock = this.blocks[this.blocks.length - 1];
      var courseEndX = lastBlock.right === undefined
        ? lastBlock.x + lastBlock.width / 2
        : lastBlock.right;
      var courseLength = Math.max(1, courseEndX - this.initialX);
      var progressFitness = Utils.clamp((this.maxForwardX - this.initialX) / courseLength, 0, 1);
      // Clearing the course is the primary goal. Forward progress and avoiding
      // prolonged contact provide smaller gradients while a creature learns.
      return Utils.clamp(
        0.82 * passedFitness + 0.13 * progressFitness + 0.05 * collisionFitness,
        0,
        1
      );
    }

    // Preserve the legacy rolling-obstacle scoring for old saved scenes.
    return Math.max(
      0.5 * collisionFitness,
      0.3 * heightFitness + 0.7 * collisionFitness
    );
  };

  /* ------------------------------------------------------------------ *
   * Brain factory (Evolution.GetBrainTypeForSimulation)
   * ------------------------------------------------------------------ */
  var Brains = {
    BrainType: BrainType,

    numberOfInputsForBrainType: function (brainType) {
      switch (brainType) {
        case BrainType.LegacyRunningBrain:
        case BrainType.LegacyJumpingBrain:
        case BrainType.LegacyClimbingBrain:
          return 6;
        case BrainType.LegacyObstacleJumpBrain:
          return 7;
        case BrainType.Universal:
          return UniversalBrain.NUMBER_OF_INPUTS;
      }
      return UniversalBrain.NUMBER_OF_INPUTS;
    },

    numberOfOutputsForBrainType: function (brainType, uniqueMusclesContext) {
      if (brainType === BrainType.Universal) {
        return (
          uniqueMusclesContext.numberOfUniqueMuscleIds + UniversalBrain.NUMBER_OF_ADDITIONAL_OUTPUTS
        );
      }
      return uniqueMusclesContext.numberOfUniqueMuscleIds;
    },

    brainTypeForSimulation: function (objective, lastV2SimulatedGeneration) {
      var useLegacyBrains = lastV2SimulatedGeneration > 0;
      if (!useLegacyBrains) return BrainType.Universal;
      switch (objective) {
        case EVO.Objective.Running:
          return BrainType.LegacyRunningBrain;
        case EVO.Objective.Jumping:
          return BrainType.LegacyJumpingBrain;
        case EVO.Objective.ObstacleJump:
          return BrainType.LegacyObstacleJumpBrain;
        case EVO.Objective.Climbing:
          return BrainType.LegacyClimbingBrain;
      }
      return BrainType.Universal;
    },

    create: function (brainType, creature) {
      switch (brainType) {
        case BrainType.LegacyRunningBrain:
          return new RunningBrain(creature);
        case BrainType.LegacyJumpingBrain:
          return new JumpingBrain(creature);
        case BrainType.LegacyObstacleJumpBrain:
          return new ObstacleJumpingBrain(creature);
        case BrainType.LegacyClimbingBrain:
          return new ClimbingBrain(creature);
        case BrainType.Universal:
        default:
          return new UniversalBrain(creature);
      }
    },
  };

  EVO.Brain = Brain;
  EVO.UniversalBrain = UniversalBrain;
  EVO.CalculateUniqueMusclesContext = calculateUniqueMusclesContext;
  EVO.ObjectiveTracker = ObjectiveTracker;
  EVO.Brains = Brains;
  EVO.BrainType = BrainType;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
