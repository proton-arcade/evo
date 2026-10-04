/*
 * Evolution (Web Edition) — sim/scene.js
 * ---------------------------------------------------------------
 * Port of the simulation scenes of the original Unity project:
 *   Assets/Scripts/Scenes/DefaultSimulationScenes.cs
 *   Assets/Scripts/Scenes/Structures/*.cs
 *   Assets/Scripts/Scenes/TrackedCamera.cs
 *
 * Every task has its own scene:
 *
 *   Running / Jumping / Flying  — a flat ground plane.
 *   Obstacle Jump               — a course of solid blocks that grow in size
 *                                 the further the creature gets.  A creature is
 *                                 rewarded for every block it clears.  (Legacy
 *                                 save files may still contain the original
 *                                 rolling obstacles, which stay supported.)
 *   Climbing                    — an infinite staircase at a 45° angle.
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});
  var Utils = EVO.Utils;

  var StructureType = {
    Ground: 'evolution::structure::ground',
    Wall: 'evolution::structure::wall',
    Stairstep: 'evolution::structure::stairstep',
    StepSpawner: 'evolution::structure::stepspawner',
    RollingObstacleSpawner: 'evolution::structure::rollingobstaclespawner',
    /** A solid block of the obstacle course (see obstacleJumpScene). */
    ObstacleBlock: 'evolution::structure::obstacleblock',
    DistanceMarkerSpawner: 'evolution::structure::distancemarkerspawner',
  };

  var COLORS = {
    ground: '#636363',
    wall: '#565656',
    steps: '#4F4F4F',
    obstacle: '#151515',
    obstacleAccent: '#4a4a4a',
    marker: '#9e9e9e',
    backgroundColor: '#ededed',
  };

  /* ------------------------------------------------------------------ *
   * Structure description
   * ------------------------------------------------------------------ */
  function structure(type, x, y, scaleX, scaleY, rotation, params) {
    var result = {
      type: type,
      transform: {
        x: x,
        y: y,
        scaleX: scaleX === undefined ? 1 : scaleX,
        scaleY: scaleY === undefined ? 1 : scaleY,
        rotation: rotation === undefined ? 0 : rotation,
      },
      params: params || {},
    };
    return result;
  }

  /* ------------------------------------------------------------------ *
   * ScenePhysicsConfiguration (ScenePhysicsConfiguration.cs)
   * ------------------------------------------------------------------ */
  var ScenePhysicsConfiguration = {
    create: function (values) {
      values = values || {};
      return {
        Gravity: values.Gravity === undefined ? -50 : values.Gravity,
        BounceThreshold: values.BounceThreshold === undefined ? 2 : values.BounceThreshold,
        SleepThreshold: values.SleepThreshold === undefined ? 0.005 : values.SleepThreshold,
        DefaultContactOffset: values.DefaultContactOffset === undefined ? 0.01 : values.DefaultContactOffset,
        DefaultSolverIterations: values.DefaultSolverIterations === undefined ? 7 : values.DefaultSolverIterations,
        DefaultSolverVelocityIterations:
          values.DefaultSolverVelocityIterations === undefined ? 10 : values.DefaultSolverVelocityIterations,
        QueriesHitBackfaces: !!values.QueriesHitBackfaces,
        QueriesHitTriggers: values.QueriesHitTriggers === undefined ? true : !!values.QueriesHitTriggers,
        AutoSyncTransforms: !!values.AutoSyncTransforms,
      };
    },

    encode: function (config) {
      return {
        gravity: config.Gravity,
        bounceThreshold: config.BounceThreshold,
        sleepThreshold: config.SleepThreshold,
        defaultContactOffset: config.DefaultContactOffset,
        defaultSolverIterations: config.DefaultSolverIterations,
        defaultSolverVelocityIterations: config.DefaultSolverVelocityIterations,
        queriesHitBackfaces: config.QueriesHitBackfaces,
        queriesHitTriggers: config.QueriesHitTriggers,
        autoSyncTransforms: config.AutoSyncTransforms,
      };
    },

    decode: function (json) {
      if (!json) return ScenePhysicsConfiguration.create();
      return ScenePhysicsConfiguration.create({
        Gravity: json.gravity,
        BounceThreshold: json.bounceThreshold,
        SleepThreshold: json.sleepThreshold,
        DefaultContactOffset: json.defaultContactOffset,
        DefaultSolverIterations: json.defaultSolverIterations,
        DefaultSolverVelocityIterations: json.defaultSolverVelocityIterations,
        QueriesHitBackfaces: json.queriesHitBackfaces,
        QueriesHitTriggers: json.queriesHitTriggers,
        AutoSyncTransforms: json.autoSyncTransforms,
      });
    },
  };

  var SimulationSceneDescription = {
    create: function (structures, dropHeight, cameraControlPoints, physicsConfiguration) {
      return {
        Version: 1,
        structures: structures,
        DropHeight: dropHeight,
        PhysicsConfiguration: physicsConfiguration || ScenePhysicsConfiguration.create(),
        CameraControlPoints: cameraControlPoints,
      };
    },

    encode: function (description) {
      return {
        version: description.Version,
        dropHeight: description.DropHeight,
        physicsConfiguration: ScenePhysicsConfiguration.encode(
          description.PhysicsConfiguration || ScenePhysicsConfiguration.create()
        ),
        cameraControlPoints: description.CameraControlPoints.map(function (point) {
          return { x: point.x, y: point.y, pivot: point.pivot };
        }),
        structures: description.structures.map(function (entry) {
          var json = {
            type: entry.type,
            x: Utils.round4(entry.transform.x),
            y: Utils.round4(entry.transform.y),
            scaleX: Utils.round4(entry.transform.scaleX),
            scaleY: Utils.round4(entry.transform.scaleY),
            rotation: Utils.round4(entry.transform.rotation),
          };
          if (entry.params && Object.keys(entry.params).length) {
            json.params = entry.params;
          }
          return json;
        }),
      };
    },

    decode: function (json) {
      if (typeof json === 'string') json = JSON.parse(json);
      return SimulationSceneDescription.create(
        (json.structures || []).map(function (entry) {
          return structure(
            entry.type,
            entry.x,
            entry.y,
            entry.scaleX,
            entry.scaleY,
            entry.rotation,
            entry.params || {}
          );
        }),
        json.dropHeight,
        (json.cameraControlPoints || []).map(function (point) {
          return { x: point.x, y: point.y, pivot: point.pivot };
        }),
        ScenePhysicsConfiguration.decode(json.physicsConfiguration)
      );
    },
  };

  /* ------------------------------------------------------------------ *
   * The default scenes (DefaultSimulationScenes.cs)
   * ------------------------------------------------------------------ */
  var FLAT_GROUND_CONTROL_POINTS = [
    { x: 0, y: 0, pivot: 0.11 },
    { x: 1, y: 0, pivot: 0.11 },
  ];

  /** The top surface of the ground plane of the default scenes. */
  var GROUND_SURFACE_Y = -4.8 + 9.56 / 2;

  /**
   * The blocks of the obstacle course (Obstacle Jump).
   *
   * The blocks stand on the ground, one behind the other, and slowly grow in
   * both width and height: every block is a little bigger and a little further
   * away than the one before it.  A creature has to get past a block (climb
   * over it, jump over it or squeeze around it) before the next one becomes
   * relevant, and it is rewarded for every block it clears.
   */
  var OBSTACLE_BLOCKS = [
    { distance: 9, width: 3.0, height: 1.0 },
    { distance: 17, width: 3.6, height: 1.8 },
    { distance: 26, width: 4.2, height: 2.6 },
    { distance: 36, width: 4.8, height: 3.4 },
    { distance: 47, width: 5.4, height: 4.2 },
  ];

  function obstacleBlockStructures() {
    return OBSTACLE_BLOCKS.map(function (block) {
      return structure(
        StructureType.ObstacleBlock,
        block.distance,
        GROUND_SURFACE_Y + block.height / 2,
        block.width,
        block.height,
        0
      );
    });
  }

  function flatGroundScene() {
    var ground = structure(StructureType.Ground, 0.476771, -4.8, 1000, 9.56, 0);
    var markers = structure(StructureType.DistanceMarkerSpawner, -0.45, 1.63, 0, 0, 0, {
      markerDistance: 5,
      angleFactor: 1,
      bestMarkerRotation: 0,
    });
    return SimulationSceneDescription.create([ground, markers], 0.5, FLAT_GROUND_CONTROL_POINTS);
  }

  var DefaultSimulationScenes = {
    runningScene: function () {
      return flatGroundScene();
    },

    jumpingScene: function () {
      var scene = flatGroundScene();
      scene.structures[1].transform.rotation = 90;
      scene.structures[1].params.bestMarkerRotation = 90;
      return scene;
    },

    flyingScene: function () {
      var scene = flatGroundScene();
      scene.structures[1].transform.rotation = 90;
      scene.structures[1].params.bestMarkerRotation = 90;
      return scene;
    },

    obstacleJumpScene: function () {
      var ground = structure(StructureType.Ground, 0.476771, -4.8, 1000, 9.56, 0);
      // Flat side walls that keep the creature inside the arena.  They are
      // upright boxes (not rotated), so they render as ordinary walls.
      var arenaHeight = 60;
      var arenaY = GROUND_SURFACE_Y + arenaHeight / 2;
      var leftWall = structure(StructureType.Wall, -30, arenaY, 4, arenaHeight, 0);
      var rightWall = structure(StructureType.Wall, 70, arenaY, 4, arenaHeight, 0);
      var structures = [ground, leftWall, rightWall].concat(obstacleBlockStructures());
      return SimulationSceneDescription.create(structures, 0.5, FLAT_GROUND_CONTROL_POINTS);
    },

    climbingScene: function () {
      var ground = structure(StructureType.Ground, 14.6, -4.8, 1000, 30, 45);
      var markers = structure(StructureType.DistanceMarkerSpawner, -0.45, 5.5, 0, 0, 45, {
        markerDistance: 5 * Math.sin(Math.PI * 0.25),
        angleFactor: 1 / Math.sin(Math.PI * 0.25),
        bestMarkerRotation: 45,
      });
      var steps = structure(StructureType.StepSpawner, 0.46, 0.99243, 1, 1, 0, {
        stepSize: 3,
        stepRotation: -16,
      });
      return SimulationSceneDescription.create([ground, markers, steps], 1, [
        { x: 0, y: 9, pivot: 0.5 },
        { x: 1, y: 10, pivot: 0.5 },
      ]);
    },

    defaultSceneForObjective: function (objective) {
      switch (objective) {
        case EVO.Objective.Running:
          return DefaultSimulationScenes.runningScene();
        case EVO.Objective.Jumping:
          return DefaultSimulationScenes.jumpingScene();
        case EVO.Objective.ObstacleJump:
          return DefaultSimulationScenes.obstacleJumpScene();
        case EVO.Objective.Flying:
          return DefaultSimulationScenes.flyingScene();
        case EVO.Objective.Climbing:
          return DefaultSimulationScenes.climbingScene();
      }
      return DefaultSimulationScenes.runningScene();
    },
  };

  /* ------------------------------------------------------------------ *
   * Scene — the instantiated scene inside a physics world
   * ------------------------------------------------------------------ */
  function Scene(world, description) {
    this.world = world;
    this.description = description;
    var physicsConfiguration =
      (description && description.PhysicsConfiguration) || ScenePhysicsConfiguration.create();
    world.gravity = physicsConfiguration.Gravity;
    world.solverIterations = physicsConfiguration.DefaultSolverIterations;
    this.structures = [];
    this.renderables = [];
    this.distanceMarkers = [];
    this.obstacles = [];
    this.obstacleSpawners = [];
    this.spawnTimers = [];
    /** The static blocks of the obstacle course (Obstacle Jump). */
    this.obstacleBlocks = [];
    this.time = 0;
    this.build();
  }

  Scene.COLORS = COLORS;
  Scene.StructureType = StructureType;

  Scene.prototype.build = function () {
    var self = this;
    this.description.structures.forEach(function (entry) {
      switch (entry.type) {
        case StructureType.Ground:
          self.addBox(entry, COLORS.ground, 'Ground');
          break;
        case StructureType.Wall:
          self.addBox(entry, COLORS.wall, 'Ground');
          break;
        case StructureType.Stairstep:
          self.addBox(entry, COLORS.steps, 'Ground');
          break;
        case StructureType.StepSpawner:
          self.buildStaircase(entry);
          break;
        case StructureType.RollingObstacleSpawner:
          self.buildObstacleSpawner(entry);
          break;
        case StructureType.ObstacleBlock:
          self.addObstacleBlock(entry);
          break;
        case StructureType.DistanceMarkerSpawner:
          self.buildDistanceMarkers(entry);
          break;
      }
    });
    this.world.rebuildGrid();
  };

  Scene.prototype.addBox = function (entry, color, tag, options) {
    options = options || {};
    var t = entry.transform;
    var halfWidth = Math.abs(t.scaleX) / 2;
    var halfHeight = Math.abs(t.scaleY) / 2;
    var angle = t.rotation * Utils.Deg2Rad;
    var box = this.world.addBox(t.x, t.y, halfWidth, halfHeight, angle, { tag: tag, friction: 1 });
    this.structures.push({ box: box, color: color, entry: entry });
    if (halfWidth < 40) {
      this.renderables.push({
        kind: 'box',
        x: t.x,
        y: t.y,
        halfWidth: halfWidth,
        halfHeight: halfHeight,
        angle: angle,
        color: color,
        accent: options.accent || null,
      });
    } else {
      // A huge ground plane: render it as a large quad around the camera.
      this.renderables.push({
        kind: 'ground',
        y: t.y + halfHeight,
        color: color,
        angle: angle,
      });
    }
    return box;
  };

  /**
   * Port of StepSpawnerBehaviour — an endless staircase that ascends at 45°
   * with steps rotated by -16°.
   */
  Scene.prototype.buildStaircase = function (entry) {
    var t = entry.transform;
    var stepSize = entry.params.stepSize || 3;
    var stepRotation = (entry.params.stepRotation === undefined ? -16 : entry.params.stepRotation);
    var spawnDistance = stepSize / 2;

    // The original spawns 4000 steps centred on the spawn position.  We only
    // build the ones that can ever be reached during a simulation.
    var range = 90;
    for (var i = -range; i <= range; i++) {
      var x = t.x + i * spawnDistance;
      var y = t.y + i * spawnDistance;
      this.world.addBox(x, y, stepSize / 2, stepSize / 2, stepRotation * Utils.Deg2Rad, {
        tag: 'Ground',
        friction: 1,
      });
      this.renderables.push({
        kind: 'box',
        x: x,
        y: y,
        halfWidth: stepSize / 2,
        halfHeight: stepSize / 2,
        angle: stepRotation * Utils.Deg2Rad,
        color: COLORS.steps,
      });
    }
  };

  Scene.prototype.buildObstacleSpawner = function (entry) {
    this.obstacleSpawners.push(entry);
    this.spawnTimers.push(0);
  };

  /**
   * Adds a static block of the obstacle course.  Blocks are solid geometry
   * (the creature has to get past them) and they are tracked so that the
   * objective tracker can reward a creature for every block it clears.
   */
  Scene.prototype.addObstacleBlock = function (entry) {
    var box = this.addBox(entry, COLORS.obstacle, 'Obstacle', {
      accent: COLORS.obstacleAccent,
    });
    var t = entry.transform;
    var halfWidth = Math.abs(t.scaleX) / 2;
    var halfHeight = Math.abs(t.scaleY) / 2;
    var block = {
      index: this.obstacleBlocks.length,
      box: box,
      x: t.x,
      y: t.y,
      width: halfWidth * 2,
      height: halfHeight * 2,
      halfWidth: halfWidth,
      halfHeight: halfHeight,
      left: t.x - halfWidth,
      right: t.x + halfWidth,
      top: t.y + halfHeight,
    };
    this.obstacleBlocks.push(block);
    return block;
  };

  /** The blocks of the obstacle course (empty for all other scenes). */
  Scene.prototype.getObstacleBlocks = function () {
    return this.obstacleBlocks;
  };

  /** The blocks a creature standing at `x` has already cleared. */
  Scene.prototype.getNumberOfBlocksPassed = function (x) {
    var passed = 0;
    for (var i = 0; i < this.obstacleBlocks.length; i++) {
      if (x > this.obstacleBlocks[i].right) passed++;
    }
    return passed;
  };

  /** The horizontal length of the whole block course. */
  Scene.prototype.getObstacleCourseLength = function () {
    if (!this.obstacleBlocks.length) return 0;
    var first = this.obstacleBlocks[0];
    var last = this.obstacleBlocks[this.obstacleBlocks.length - 1];
    return Math.max(0, last.right - first.left);
  };

  Scene.prototype.buildDistanceMarkers = function (entry) {
    var t = entry.transform;
    var markerDistance = entry.params.markerDistance || 5;
    var angleFactor = entry.params.angleFactor || 1;
    var rotation = (entry.params.bestMarkerRotation || 0) * Utils.Deg2Rad;
    var spacing = markerDistance * angleFactor;
    var direction = { x: Math.cos(rotation), y: Math.sin(rotation) };

    for (var i = -10; i < 120; i++) {
      var distance = i * markerDistance;
      this.distanceMarkers.push({
        x: t.x + direction.x * i * spacing,
        y: t.y + direction.y * i * spacing,
        angle: rotation,
        label: String(Math.round(distance)),
      });
    }
    this.markerRotation = rotation;
  };

  Scene.prototype.spawnObstacle = function (spawnerEntry) {
    var entry = spawnerEntry;
    var params = entry.params;
    var angle = entry.transform.rotation * Utils.Deg2Rad;
    // transform.right in Unity is the local x axis.
    var rightX = Math.cos(angle);
    var rightY = Math.sin(angle);

    var obstacle = {
      x: entry.transform.x,
      y: entry.transform.y,
      radius: Scene.OBSTACLE_RADIUS,
      vx: 0,
      vy: 0,
      mass: Scene.OBSTACLE_MASS,
      lifetime: params.obstacleLifetime || 5,
      age: 0,
      rightX: rightX * (params.forceMultiplier || 1),
      rightY: rightY * (params.forceMultiplier || 1),
    };
    // The spawner applies BASE_FORCE (5000 N) for one frame, which results in
    // an initial velocity of ~5 m/s for the 20 kg obstacle ball.
    var impulse = Scene.OBSTACLE_BASE_FORCE / obstacle.mass;
    obstacle.vx = rightX * impulse * (params.forceMultiplier || 1);
    obstacle.vy = rightY * impulse * (params.forceMultiplier || 1);

    obstacle.circle = this.world.addCircle(obstacle.x, obstacle.y, obstacle.radius, {
      tag: 'Obstacle',
      friction: 1,
    });
    obstacle.renderable = {
      kind: 'circle',
      x: obstacle.x,
      y: obstacle.y,
      radius: obstacle.radius,
      color: COLORS.obstacle,
      spin: 0,
    };
    this.renderables.push(obstacle.renderable);
    this.obstacles.push(obstacle);
    return obstacle;
  };

  Scene.OBSTACLE_RADIUS = 2.5;
  Scene.OBSTACLE_MASS = 5;
  Scene.OBSTACLE_BASE_FORCE = 5000;

  Scene.prototype.reset = function () {
    // Remove all dynamic obstacles and restart the spawn timers.
    for (var i = 0; i < this.obstacles.length; i++) {
      var obstacle = this.obstacles[i];
      this.world.removeCircle(obstacle.circle);
      var index = this.renderables.indexOf(obstacle.renderable);
      if (index >= 0) this.renderables.splice(index, 1);
    }
    this.obstacles = [];
    for (var s = 0; s < this.spawnTimers.length; s++) {
      this.spawnTimers[s] = 0;
    }
    this.time = 0;
  };

  Scene.prototype.update = function (dt) {
    this.time += dt;

    for (var i = 0; i < this.obstacleSpawners.length; i++) {
      var entry = this.obstacleSpawners[i];
      var interval = entry.params.spawnInterval || 5;
      this.spawnTimers[i] += dt;
      if (this.spawnTimers[i] >= 0) {
        this.spawnTimers[i] -= interval;
        this.spawnObstacle(entry);
      }
    }

    // Integrate the obstacles (they are simple rolling balls).
    for (var o = this.obstacles.length - 1; o >= 0; o--) {
      var obstacle = this.obstacles[o];
      obstacle.age += dt;
      obstacle.onGround = false;
      obstacle.vy += this.world.gravity * dt;
      obstacle.x += obstacle.vx * dt;
      obstacle.y += obstacle.vy * dt;

      // Collide with the static geometry (approximated as a point mass).
      var candidates = this.world.queryStatic(obstacle.x, obstacle.y, obstacle.radius);
      for (var c = 0; c < candidates.length; c++) {
        var candidate = candidates[c];
        if (candidate.tag === 'Obstacle') continue;
        if (candidate.hx !== undefined) {
          this.resolveObstacleBox(obstacle, candidate);
        } else {
          this.resolveObstacleCircle(obstacle, candidate);
        }
      }

      // Rolling friction: the ball loses speed while it touches the ground.
      if (obstacle.onGround) {
        var speed = Math.sqrt(obstacle.vx * obstacle.vx);
        var deceleration = 9.81 * 0.4 * dt;
        if (speed > 1e-6) {
          obstacle.vx -= Utils.sign(obstacle.vx) * Math.min(speed, deceleration);
        }
        obstacle.spin += obstacle.vx * dt * 2;
      }

      // Collisions with the creature joints.
      this.resolveObstacleCreatureCollisions(obstacle, dt);

      obstacle.circle.x = obstacle.x;
      obstacle.circle.y = obstacle.y;
      obstacle.renderable.x = obstacle.x;
      obstacle.renderable.y = obstacle.y;
      obstacle.renderable.spin = obstacle.spin;

      if (obstacle.age > obstacle.lifetime) {
        this.world.removeCircle(obstacle.circle);
        var renderIndex = this.renderables.indexOf(obstacle.renderable);
        if (renderIndex >= 0) this.renderables.splice(renderIndex, 1);
        this.obstacles.splice(o, 1);
      }
    }
  };

  /**
   * The obstacle balls push the creature joints (and are pushed back).
   */
  Scene.prototype.resolveObstacleCreatureCollisions = function (obstacle, dt) {
    var bodies = this.world.bodies;
    for (var i = 0; i < bodies.length; i++) {
      var body = bodies[i];
      if (!body.collides) continue;
      var dx = body.x - obstacle.x;
      var dy = body.y - obstacle.y;
      var minDistance = body.radius + obstacle.radius;
      var distanceSq = dx * dx + dy * dy;
      if (distanceSq >= minDistance * minDistance) continue;

      var distance = Math.sqrt(distanceSq);
      var nx, ny;
      if (distance > 1e-9) {
        nx = dx / distance;
        ny = dy / distance;
      } else {
        nx = 0;
        ny = 1;
      }

      var penetration = minDistance - distance;
      var totalInvMass = (body.fixed ? 0 : body.invMass) + 1 / obstacle.mass;
      if (totalInvMass <= 0) continue;

      // Positional correction
      if (!body.fixed) {
        body.x += nx * penetration * (body.invMass / totalInvMass);
        body.y += ny * penetration * (body.invMass / totalInvMass);
      }
      obstacle.x -= nx * penetration * (1 / obstacle.mass / totalInvMass);
      obstacle.y -= ny * penetration * (1 / obstacle.mass / totalInvMass);

      // Relative velocity along the normal
      var relativeNormalVelocity =
        (obstacle.vx - (body.fixed ? 0 : body.vx)) * nx +
        (obstacle.vy - (body.fixed ? 0 : body.vy)) * ny;
      if (relativeNormalVelocity < 0) {
        var restitution = 0.2;
        var impulse = (-(1 + restitution) * relativeNormalVelocity) / totalInvMass;
        if (!body.fixed) {
          body.vx -= nx * impulse * body.invMass;
          body.vy -= ny * impulse * body.invMass;
        }
        obstacle.vx += nx * impulse * (1 / obstacle.mass);
        obstacle.vy += ny * impulse * (1 / obstacle.mass);
      }

      body.touchingObstacle = true;
    }
  };

  Scene.prototype.resolveObstacleBox = function (obstacle, box) {
    var local = box.toLocal(obstacle.x, obstacle.y);
    var closestX = Utils.clamp(local.x, -box.hx, box.hx);
    var closestY = Utils.clamp(local.y, -box.hy, box.hy);
    var dx = local.x - closestX;
    var dy = local.y - closestY;
    var distanceSq = dx * dx + dy * dy;
    if (distanceSq > obstacle.radius * obstacle.radius || distanceSq < 1e-12) return false;

    var distance = Math.sqrt(distanceSq);
    var penetration = obstacle.radius - distance;
    var normal = box.toWorldDirection(dx / distance, dy / distance);
    obstacle.x += normal.x * penetration;
    obstacle.y += normal.y * penetration;

    var vn = obstacle.vx * normal.x + obstacle.vy * normal.y;
    if (vn < 0) {
      obstacle.vx -= normal.x * vn * 1.4;
      obstacle.vy -= normal.y * vn * 1.4;
    }
    // Rolling friction
    obstacle.vx *= 0.999;
    return true;
  };

  Scene.prototype.resolveObstacleCircle = function (obstacle, circle) {
    var dx = obstacle.x - circle.x;
    var dy = obstacle.y - circle.y;
    var distance = Math.sqrt(dx * dx + dy * dy);
    var minDistance = circle.radius + obstacle.radius;
    if (distance >= minDistance || distance < 1e-9) return false;
    var nx = dx / distance;
    var ny = dy / distance;
    obstacle.x += nx * (minDistance - distance);
    obstacle.y += ny * (minDistance - distance);
    var vn = obstacle.vx * nx + obstacle.vy * ny;
    if (vn < 0) {
      obstacle.vx -= nx * vn * 1.3;
      obstacle.vy -= ny * vn * 1.3;
    }
    if (ny > 0.3) obstacle.onGround = true;
    return true;
  };

  /**
   * The obstacle the legacy obstacle-jump brain measures its distance to: the
   * next block that is still ahead of the creature (or the last one when the
   * whole course has been cleared).  Rolling obstacles of legacy scenes are
   * still reported as before.
   */
  Scene.prototype.getObstacle = function (x) {
    if (this.obstacleBlocks.length) {
      var blocks = this.obstacleBlocks;
      if (x !== undefined && x !== null) {
        for (var i = 0; i < blocks.length; i++) {
          if (blocks[i].right >= x) {
            return { x: blocks[i].left, y: blocks[i].y, block: blocks[i] };
          }
        }
      }
      var last = blocks[blocks.length - 1];
      return { x: last.left, y: last.y, block: last };
    }
    return this.obstacles.length ? this.obstacles[0] : null;
  };

  /* ------------------------------------------------------------------ *
   * TrackedCamera (Scenes/TrackedCamera.cs)
   * ------------------------------------------------------------------ */
  function TrackedCamera(options) {
    options = options || {};
    this.x = 0;
    this.y = options.y || 0;
    this.orthographicSize = options.orthographicSize || 12.24;
    this.initialZoom = this.orthographicSize;
    this.zoomInLength = 10;
    this.zoomOutLength = 10;
    this.zoomAnchorX = 0.5;
    this.zoomAnchorY = 0.5;
    this.controlPoints = options.controlPoints || [];
    this.target = null;
    this.allowVerticalFollow = true;
    this.verticalTrackStartYPercent = 0.25;
    this.verticalTrackEndYPercent = 0.4;
    this.lastControlSegmentIndex = 0;
    this.freeX = null;
    this.freeY = null;
  }

  TrackedCamera.prototype.getVisibleHalfHeight = function () {
    return this.orthographicSize;
  };

  TrackedCamera.prototype.setZoom = function (newZoom) {
    var minZoom = this.initialZoom - this.zoomInLength;
    var maxZoom = this.initialZoom + this.zoomOutLength;
    var size = this.orthographicSize;
    var newSize = Utils.clamp(newZoom, Math.max(1, minZoom), maxZoom);
    this.orthographicSize = newSize;

    // Readjust the centre position based on the zoom anchor.
    var anchorAdjustY = (this.zoomAnchorY - 0.5) * (size * 2 - newSize * 2);
    this.y += anchorAdjustY * 0.5;
  };

  TrackedCamera.prototype.interpolatedControlPoint = function (x) {
    var points = this.controlPoints;
    if (points.length === 0) {
      return { x: x, y: this.target ? this.target.getYPosition() : 0, pivot: 0.31 };
    }
    if (points.length === 1) return points[0];

    var segmentIndex = this.lastControlSegmentIndex;
    if (segmentIndex < 0 || segmentIndex >= points.length - 1) segmentIndex = 0;
    if (points[segmentIndex].x > x || x > points[segmentIndex + 1].x) {
      segmentIndex = this.binarySearchSegment(x);
    }

    var left, right;
    if (segmentIndex < 0) {
      left = points[0];
      right = points[1];
    } else if (segmentIndex > 0 && segmentIndex >= points.length - 1) {
      left = points[points.length - 2];
      right = points[points.length - 1];
    } else {
      left = points[segmentIndex];
      right = points[segmentIndex + 1];
    }

    var t = (x - left.x) / (right.x - left.x);
    var y = left.y + t * (right.y - left.y);
    var pivot = Utils.clamp(left.pivot + t * (right.pivot - left.pivot), 0, 1);
    return { x: x, y: y, pivot: pivot };
  };

  TrackedCamera.prototype.binarySearchSegment = function (x) {
    var points = this.controlPoints;
    if (x < points[0].x) return -1;
    if (x > points[points.length - 1].x) return points.length;

    var leftBound = 0;
    var rightBound = points.length - 2;
    while (leftBound <= rightBound) {
      var mid = Math.floor(0.5 * (leftBound + rightBound));
      if (points[mid].x <= x && x <= points[mid + 1].x) return mid;
      if (x < points[mid].x) rightBound = mid - 1;
      else leftBound = mid + 1;
    }
    return 0;
  };

  TrackedCamera.prototype.update = function () {
    if (!this.target) return;
    if (this.freeX !== null && this.freeX !== undefined) {
      this.x = this.freeX;
      this.y = this.freeY;
      return;
    }

    var controlPoint = this.interpolatedControlPoint(this.target.getXPosition());
    this.zoomAnchorY = controlPoint.pivot;
    var cameraY = controlPoint.y - (controlPoint.pivot - 0.5) * (this.orthographicSize * 2);

    if (this.allowVerticalFollow) {
      var targetY = this.target.getYPosition();
      var viewportHeight = this.orthographicSize * 2;
      var start = cameraY + this.verticalTrackStartYPercent * viewportHeight;
      var end = cameraY + this.verticalTrackEndYPercent * viewportHeight;
      var t = Utils.clamp((targetY - start) / (end - start), 0, 1);
      var eased = Utils.easeInOutQuad(t);
      var unclampedY = Utils.lerp(cameraY, targetY, eased);
      cameraY = Math.max(cameraY, unclampedY);
    }

    this.x = controlPoint.x;
    this.y = cameraY;
  };

  EVO.StructureType = StructureType;
  EVO.SceneColors = COLORS;
  EVO.ScenePhysicsConfiguration = ScenePhysicsConfiguration;
  EVO.SimulationSceneDescription = SimulationSceneDescription;
  EVO.DefaultSimulationScenes = DefaultSimulationScenes;
  EVO.Scene = Scene;
  EVO.TrackedCamera = TrackedCamera;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
