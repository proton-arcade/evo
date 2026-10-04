/*
 * Evolution (Web Edition) — sim/ecosystem.js
 * ---------------------------------------------------------------
 * Runs several saved creature designs together in one shared physics scene.
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});
  var FIXED_TIMESTEP = 1 / 60;
  var PHYSICS_SUBSTEPS = 3;
  var PHYSICS_ITERATIONS = 4;

  function EcosystemSimulation() {
    this.world = null;
    this.scene = null;
    this.creatures = [];
    this.sceneDescription = null;
    this.entries = [];
    this.objective = EVO.Objective.Running;
    this.isRunning = false;
    this.paused = false;
    this.complete = false;
    this.elapsed = 0;
    this.duration = Infinity;
    this.accumulator = 0;
    this.speed = 1;
  }

  EcosystemSimulation.prototype.start = function (entries, objective, sceneDescription, duration) {
    this.stop();
    if (!entries || entries.length < 2) {
      throw new Error('Choose at least two creatures to start an ecosystem.');
    }

    this.entries = entries.slice();
    this.objective = objective;
    this.sceneDescription = sceneDescription || EVO.DefaultSimulationScenes.defaultSceneForObjective(objective);
    this.world = new EVO.PhysicsWorld();
    this.world.interCreatureCollisions = true;
    this.scene = new EVO.Scene(this.world, this.sceneDescription);
    this.creatures = [];
    this.elapsed = 0;
    this.duration = isFinite(duration) && duration > 0 ? duration : Infinity;
    this.accumulator = 0;
    this.paused = false;
    this.complete = false;

    var cursorX = -0.5 * (entries.length - 1);
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      if (!entry || !entry.design || !entry.design.joints || !entry.design.joints.length) {
        this.stop();
        throw new Error('A selected creature has no joints to simulate.');
      }

      var design = EVO.CreatureDesign.clone(entry.design);
      var creature = new EVO.Creature(this.world, design, {
        scene: this.scene,
        creatureIndex: i,
        name: entry.name || design.name,
      });
      creature.objectiveTracker = EVO.ObjectiveTracker.create(objective, creature);
      creature.usesLegacyRotationCalculation = !!(
        entry.evolvedCreature && entry.evolvedCreature.lastV2SimulatedGeneration > 0
      );

      var minX = Infinity;
      var maxX = -Infinity;
      for (var joint = 0; joint < creature.joints.length; joint++) {
        var x = creature.joints[joint].body.x;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
      var width = Math.max(0, maxX - minX);
      var groundDistance = creature.semiSafeDistanceFromGround(objective === EVO.Objective.Climbing);
      if (!isFinite(groundDistance)) groundDistance = 0;
      creature.translate(cursorX - minX, this.sceneDescription.DropHeight - groundDistance);
      creature.resolveStaticOverlap();
      creature.prepareForEvolution();
      creature.initialPosition = { x: creature.getXPosition(), y: creature.getYPosition() };
      creature.updateGeometry(0);

      this.applyBrain(creature, entry);
      this.creatures.push(creature);
      cursorX += width + 1.5;
    }

    this.scene.reset();
    var creatures = this.creatures;
    this.world.addForceCallback(function (world, subDt) {
      for (var index = 0; index < creatures.length; index++) {
        creatures[index].applyForces(world, subDt);
      }
    });
    this.isRunning = true;
    return this;
  };

  EcosystemSimulation.prototype.applyBrain = function (creature, entry) {
    var profile = entry.evolvedCreature;
    var brainObjective = profile ? profile.task : this.objective;
    var lastV2Generation = profile ? profile.lastV2SimulatedGeneration || 0 : 0;
    var brainType = EVO.Brains.brainTypeForSimulation(brainObjective, lastV2Generation);
    var brain = EVO.Brains.create(brainType, creature);
    var uniqueMusclesContext = EVO.CalculateUniqueMusclesContext(creature.muscles);
    var networkSettings = profile && profile.networkSettings
      ? EVO.NeuralNetworkSettings.decode(profile.networkSettings)
      : EVO.NeuralNetworkSettings.defaultSettings();
    var chromosome = profile && profile.chromosome && profile.chromosome.length
      ? profile.chromosome
      : null;

    brain.init(networkSettings, creature.muscles, uniqueMusclesContext, chromosome);
    creature.brain = brain;
  };

  EcosystemSimulation.prototype.update = function (deltaTime, speed) {
    if (!this.isRunning || this.paused) return;
    this.speed = speed === undefined ? this.speed : speed;
    this.accumulator += Math.min(0.1, Math.max(0, deltaTime || 0)) * this.speed;
    var steps = 0;
    while (this.accumulator >= FIXED_TIMESTEP && steps < 40 && !this.complete) {
      var stepSize = Math.min(FIXED_TIMESTEP, this.duration - this.elapsed);
      if (stepSize <= 0) {
        this.complete = true;
        this.paused = true;
        break;
      }
      this.tick(stepSize);
      this.accumulator -= FIXED_TIMESTEP;
      steps++;
    }
    if (steps >= 40 || this.complete) this.accumulator = 0;
  };

  EcosystemSimulation.prototype.tick = function (deltaTime) {
    if (!this.world || !this.scene) return;
    var creatures = this.creatures;
    for (var i = 0; i < creatures.length; i++) creatures[i].updateBrain(deltaTime);

    this.world.simulate(deltaTime, PHYSICS_SUBSTEPS, PHYSICS_ITERATIONS);
    this.scene.update(deltaTime);
    for (var c = 0; c < creatures.length; c++) {
      creatures[c].syncContacts();
      creatures[c].updateBoneVelocities();
      creatures[c].update(deltaTime);
    }
    this.elapsed += deltaTime;
    if (this.elapsed >= this.duration - 1e-8) {
      this.elapsed = this.duration;
      this.complete = true;
      this.paused = true;
    }
  };

  EcosystemSimulation.prototype.togglePaused = function () {
    if (this.complete) return true;
    this.paused = !this.paused;
    return this.paused;
  };

  EcosystemSimulation.prototype.stop = function () {
    if (this.world) this.world.clear();
    this.world = null;
    this.scene = null;
    this.creatures = [];
    this.isRunning = false;
    this.paused = false;
    this.complete = false;
    this.elapsed = 0;
    this.duration = Infinity;
    this.accumulator = 0;
  };

  EVO.EcosystemSimulation = EcosystemSimulation;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
