/*
 * Evolution (Web Edition) — sim/evolution.js
 * ---------------------------------------------------------------
 * Port of the evolution loop of the original Unity project:
 *   Assets/Scripts/Controllers/Evolution.cs
 *   Assets/Scripts/Controllers/SimulationSceneBuilder.cs
 *   Assets/Scripts/Scenes/SimulationSceneContext.cs
 *
 * A generation consists of `PopulationSize` creatures that are simulated
 * either all at once or in batches of `BatchSize` creatures.  After every
 * batch the creatures are evaluated, and once every creature of the
 * generation has been evaluated, the best solutions are selected, recombined
 * and mutated into the next generation's population.
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});
  var Utils = EVO.Utils;

  var FIXED_TIMESTEP = 1 / 60;
  var PHYSICS_SUBSTEPS = 3;
  var PHYSICS_ITERATIONS = 4;

  /**
   * @param options.data        The SimulationData (settings, design, chromosomes)
   * @param options.onEvent     Optional callback (name, payload)
   */
  function Evolution(options) {
    options = options || {};
    this.data = options.data;
    this.onEvent = options.onEvent || function () {};

    this.Settings = this.data.Settings;
    this.NetworkSettings = this.data.NetworkSettings;
    this.SettingsForNextGeneration = Object.assign({}, this.data.Settings);

    this.currentGenerationNumber = this.data.BestCreatures.length + 1;
    this.currentBatchNumber = 1;
    this.currentBatchSize = 0;
    this.numberOfBatches = 1;
    this.uniqueMusclesContext = EVO.CalculateUniqueMusclesContext(this.data.CreatureDesign.muscles);

    this.world = null;
    this.scene = null;
    this.currentCreatureBatch = [];
    this.recorders = [];
    this.solutions = [];
    this.solutionIndex = 0;
    this.chromosomeOffset = 0;
    this.batchElapsed = 0;
    this.accumulator = 0;
    this.tickCount = 0;
    this.state = 'idle';
    this.paused = false;
    this.isRunning = false;
    /** Recordings of the best creature of every *evaluated* generation. */
    this.recordings = [];
    this.generationFitness = [];
  }

  Evolution.FIXED_TIMESTEP = FIXED_TIMESTEP;

  Evolution.prototype.start = function () {
    this.currentGenerationNumber = this.data.BestCreatures.length + 1;
    this.recordings = [];
    this.generationFitness = [];
    this.state = 'idle';
    this.paused = false;
    this.isRunning = true;
    this.onEvent('initializationDidEnd');
    this.beginGeneration();
  };

  Evolution.prototype.finish = function () {
    this.isRunning = false;
    this.teardownBatch();
  };

  Evolution.prototype.pause = function () {
    this.paused = true;
  };

  Evolution.prototype.resume = function () {
    this.paused = false;
  };

  /* ------------------------------------------------------------------ *
   * Generation / batch lifecycle
   * ------------------------------------------------------------------ */
  Evolution.prototype.beginGeneration = function () {
    this.Settings = Object.assign({}, this.SettingsForNextGeneration);
    this.data.Settings = this.Settings;

    var populationSize = this.Settings.PopulationSize;
    this.solutions = new Array(populationSize);
    this.solutionIndex = 0;
    this.chromosomeOffset = 0;
    this.currentBatchNumber = 1;

    var actualBatchSize = this.Settings.SimulateInBatches
      ? this.Settings.BatchSize
      : this.Settings.PopulationSize;
    this.actualBatchSize = actualBatchSize;
    this.numberOfBatches = Math.ceil(this.Settings.PopulationSize / actualBatchSize);

    // Make sure the chromosome pool is complete.
    if (this.data.CurrentChromosomes.length < populationSize) {
      var brainType = EVO.Brains.brainTypeForSimulation(
        this.Settings.Objective,
        this.data.LastV2SimulatedGeneration
      );
      var inputCount = EVO.Brains.numberOfInputsForBrainType(brainType);
      var outputCount = EVO.Brains.numberOfOutputsForBrainType(brainType, this.uniqueMusclesContext);
      var chromosomeLength = EVO.FeedForwardNetwork.chromosomeLength(
        inputCount,
        outputCount,
        this.NetworkSettings
      );
      while (this.data.CurrentChromosomes.length < populationSize) {
        var weights = new Array(chromosomeLength);
        EVO.FeedForwardNetwork.populateRandomWeights(weights);
        this.data.CurrentChromosomes.push(weights);
      }
    }

    this.onEvent('newGenerationDidBegin', this.currentGenerationNumber);
    this.beginBatch();
  };

  Evolution.prototype.beginBatch = function () {
    this.teardownBatch();

    var remainingCreatures =
      this.Settings.PopulationSize - (this.currentBatchNumber - 1) * this.actualBatchSize;
    var currentBatchSize = Math.min(this.actualBatchSize, remainingCreatures);
    this.currentBatchSize = currentBatchSize;

    this.world = new EVO.PhysicsWorld();
    this.scene = new EVO.Scene(this.world, this.data.SceneDescription);

    var batch = [];
    for (var i = 0; i < currentBatchSize; i++) {
      var creature = new EVO.Creature(this.world, this.data.CreatureDesign, {
        scene: this.scene,
        creatureIndex: i,
      });
      creature.objectiveTracker = EVO.ObjectiveTracker.create(this.Settings.Objective, creature);
      creature.usesLegacyRotationCalculation = this.data.LastV2SimulatedGeneration > 0;
      creature.initialPosition = { x: creature.getXPosition(), y: creature.getYPosition() };
      batch.push(creature);
    }
    this.currentCreatureBatch = batch;

    // Position the creatures on the ground and apply their brains.
    this.placeCreatures(batch);

    var chromosomeCount = Math.min(this.data.CurrentChromosomes.length, batch.length);
    var chromosomes = [];
    for (var c = 0; c < chromosomeCount; c++) {
      chromosomes.push(this.data.CurrentChromosomes[c + this.chromosomeOffset]);
    }
    this.chromosomeOffset += batch.length;
    this.applyBrains(batch, chromosomes);

    // Recorders (one per creature of a batch, reused between batches).
    var numberOfJoints = batch.length ? batch[0].joints.length : 0;
    var numberOfMuscles = batch.length ? batch[0].muscles.length : 0;
    var recordingDurationInSeconds = Math.min(10, this.Settings.SimulationTime);
    for (var r = 0; r < this.actualBatchSize; r++) {
      var recorder = this.recorders[r];
      var needsNewRecorder =
        !recorder ||
        recorder.recordingDurationInSeconds !== recordingDurationInSeconds ||
        recorder.numberOfJoints !== numberOfJoints ||
        recorder.numberOfMuscles !== numberOfMuscles;
      if (needsNewRecorder && batch.length) {
        this.recorders[r] = new EVO.CreatureRecorder(
          recordingDurationInSeconds,
          numberOfJoints,
          numberOfMuscles
        );
      } else if (this.recorders[r]) {
        this.recorders[r].reset();
      }
    }
    for (var j = 0; j < batch.length; j++) {
      batch[j].recorder = this.recorders[j] || null;
    }

    for (var b = 0; b < batch.length; b++) {
      batch[b].prepareForEvolution();
    }
    // Reset the dynamic structures (obstacles) for a fresh batch.
    this.scene.reset();

    this.batchElapsed = 0;
    this.accumulator = 0;
    this.tickCount = 0;

    this.onEvent('newBatchDidBegin', {
      generation: this.currentGenerationNumber,
      batch: this.currentBatchNumber,
      batchCount: this.numberOfBatches,
    });
  };

  Evolution.prototype.placeCreatures = function (batch) {
    var dropHeight = this.data.SceneDescription.DropHeight;
    var sceneContainsStairs = this.Settings.Objective === EVO.Objective.Climbing;

    for (var i = 0; i < batch.length; i++) {
      var creature = batch[i];
      var distance = creature.semiSafeDistanceFromGround(sceneContainsStairs);
      if (!isFinite(distance) || distance <= 0) distance = dropHeight;
      creature.translate(0, dropHeight - distance + (distance < dropHeight ? 0 : 0));
      // Horizontal offset so that the creatures do not overlap visually.
      creature.translate(i * 0.15 - (batch.length - 1) * 0.075, 0);
      creature.initialPosition = {
        x: creature.getXPosition(),
        y: creature.getYPosition(),
      };
      creature.updateGeometry(0);
    }
  };

  Evolution.prototype.applyBrains = function (creatures, chromosomes) {
    var self = this;
    creatures.forEach(function (creature, index) {
      var chromosome = index < chromosomes.length ? chromosomes[index] : null;
      self.applyBrain(creature, chromosome);
    });
  };

  Evolution.prototype.applyBrain = function (creature, chromosome) {
    var brainType = EVO.Brains.brainTypeForSimulation(
      this.Settings.Objective,
      this.data.LastV2SimulatedGeneration
    );
    var brain = EVO.Brains.create(brainType, creature);
    brain.init(
      this.NetworkSettings,
      creature.muscles,
      this.uniqueMusclesContext,
      chromosome || null
    );
    creature.brain = brain;
  };

  /* ------------------------------------------------------------------ *
   * Simulation stepping
   * ------------------------------------------------------------------ */
  /** Advances the simulation by `dt` seconds of simulated time. */
  Evolution.prototype.update = function (dt) {
    if (!this.isRunning || this.paused) return;

    if (this.state === 'idle') {
      this.state = 'simulating';
    }

    this.accumulator += dt;

    // Upper bound per frame to avoid death spirals on slow devices.
    var maxSteps = 40;
    var steps = 0;
    while (this.accumulator >= FIXED_TIMESTEP && steps < maxSteps) {
      this.tick(FIXED_TIMESTEP);
      this.accumulator -= FIXED_TIMESTEP;
      steps++;
      if (this.state !== 'simulating') break;
    }
    if (steps >= maxSteps) this.accumulator = 0;
  };

  Evolution.prototype.tick = function (dt) {
    var batch = this.currentCreatureBatch;
    if (!batch.length || !this.world) {
      this.finishBatch();
      return;
    }

    var i;
    var self = this;

    // 1. Brains (Unity: FixedUpdate)
    for (i = 0; i < batch.length; i++) {
      batch[i].updateBrain(dt);
    }

    // 2. Physics — every creature contributes its muscle and wing forces.
    var forceCallback = function (world, subDt) {
      for (var c = 0; c < batch.length; c++) {
        batch[c].applyForces(world, subDt);
      }
    };
    this.world.addForceCallback(forceCallback);
    this.world.simulate(dt, PHYSICS_SUBSTEPS, PHYSICS_ITERATIONS);
    this.world.forceCallbacks.pop();

    // 3. Dynamic structures (rolling obstacles)
    this.scene.update(dt);

    // 4. Book keeping
    for (i = 0; i < batch.length; i++) {
      var creature = batch[i];
      creature.syncContacts();
      creature.updateBoneVelocities();
      creature.update(dt);

      // Record two samples per tick to get the original 30 samples/second.
      if (this.tickCount % 2 === 0) {
        creature.recordSample();
      }
    }

    this.tickCount++;
    this.batchElapsed += dt;

    if (this.batchElapsed >= this.Settings.SimulationTime) {
      this.finishBatch();
    }
  };

  Evolution.prototype.finishBatch = function () {
    var batch = this.currentCreatureBatch;
    var simulationTime = this.Settings.SimulationTime;

    for (var i = 0; i < batch.length; i++) {
      var creature = batch[i];
      var solution = {
        chromosome: creature.brain ? creature.brain.network.toFloatArray() : [],
        stats: creature.getStatistics(simulationTime),
        numberOfNetworkOutputs: creature.brain ? creature.brain.network.numberOfOutputs() : 0,
        recorder: creature.recorder,
        creatureIndex: i,
      };
      this.solutions[this.solutionIndex++] = solution;
    }

    this.currentCreatureBatch = [];

    if (this.currentBatchNumber < this.numberOfBatches) {
      this.currentBatchNumber++;
      this.beginBatch();
    } else {
      this.evaluateSolutions();
    }
  };

  Evolution.prototype.teardownBatch = function () {
    this.currentCreatureBatch = [];
    if (this.world) {
      this.world.clear();
    }
    this.world = null;
    this.scene = null;
  };

  /* ------------------------------------------------------------------ *
   * Evaluation, selection and breeding
   * ------------------------------------------------------------------ */
  Evolution.prototype.evaluateSolutions = function () {
    var solutions = this.solutions;
    var self = this;

    // Sort by fitness (descending)
    solutions.sort(function (lhs, rhs) {
      return rhs.stats.unclampedFitness - lhs.stats.unclampedFitness;
    });

    var best = solutions[0];
    this.bestSolution = best;

    this.data.BestCreatures.push(
      EVO.ChromosomeData.create(
        best.chromosome.map(function (value) {
          return value;
        }),
        best.stats
      )
    );

    // Create a recording of the best creature of this generation.
    var recording = null;
    if (best.recorder) {
      var movementData = best.recorder.toRecordingMovementData();
      recording = EVO.CreatureRecording.create(
        EVO.CreatureDesign.clone(this.data.CreatureDesign),
        this.data.SceneDescription,
        movementData,
        this.Settings.Objective,
        this.currentGenerationNumber,
        best.stats,
        this.getNumberOfCurrentBrainInputs(),
        best.numberOfNetworkOutputs,
        this.NetworkSettings
      );
      this.recordings.push(recording);
      this.generationFitness.push(best.stats.unclampedFitness);
    }

    this.onEvent('generationDidEnd', {
      generation: this.currentGenerationNumber,
      best: best,
      recording: recording,
    });

    this.data.CurrentChromosomes = this.createNewChromosomes(
      this.Settings.PopulationSize,
      solutions,
      this.Settings.KeepBestCreatures
    );
    this.currentGenerationNumber++;
    this.state = 'idle';
    this.beginGeneration();
  };

  Evolution.prototype.createNewChromosomes = function (nextGenerationSize, solutions, keepBest) {
    var result = new Array(nextGenerationSize);

    var lazyChromosomes = solutions.map(function (solution) {
      return {
        chromosome: solution.chromosome,
        stats: solution.stats,
        getFitness: function () {
          return this.stats.fitness;
        },
      };
    });

    var selection = new EVO.Selection(this.Settings.SelectionAlgorithm, lazyChromosomes);

    var start = 0;
    if (keepBest && lazyChromosomes.length >= 2) {
      // Keep the two best creatures of the previous generation.
      var best = selection.selectBest(2);
      result[0] = best[0].chromosome;
      result[1] = best[1].chromosome;
      start = 2;
    } else if (keepBest && lazyChromosomes.length === 1) {
      result[0] = lazyChromosomes[0].chromosome;
      start = 1;
    }

    var recombinationResult = [null, null];
    for (var i = start; i < result.length; i += 2) {
      var parent1 = selection.select();
      var parent2 = selection.select();
      if (!parent1 || !parent2) {
        var random = new Array(result.length ? result[0].length : 0);
        EVO.FeedForwardNetwork.populateRandomWeights(random);
        result[i] = random;
        continue;
      }

      EVO.Recombination.recombine(
        parent1.chromosome,
        parent2.chromosome,
        recombinationResult,
        this.Settings.RecombinationAlgorithm
      );

      result[i] = this.mutated(recombinationResult[0]);
      if (i + 1 < result.length) {
        result[i + 1] = this.mutated(recombinationResult[1]);
      }
    }

    return result;
  };

  Evolution.prototype.mutated = function (chromosome) {
    var shouldMutate = Utils.randomRange(0, 100) < this.Settings.MutationRate * 100;
    if (!shouldMutate) return chromosome.slice();
    return EVO.Mutation.mutate(chromosome.slice(), this.Settings.MutationAlgorithm);
  };

  Evolution.prototype.getNumberOfCurrentBrainInputs = function () {
    var brainType = EVO.Brains.brainTypeForSimulation(
      this.Settings.Objective,
      this.data.LastV2SimulatedGeneration
    );
    return EVO.Brains.numberOfInputsForBrainType(brainType);
  };

  Evolution.prototype.getLegacySimulationOptions = function () {
    return {
      LegacyRotationCalculation: this.data.LastV2SimulatedGeneration > 0,
      LegacyClimbingDropCalculation:
        this.data.LastV2SimulatedGeneration > 0 && this.Settings.Objective === EVO.Objective.Climbing,
    };
  };

  /** The creature that the camera focuses on in the current batch. */
  Evolution.prototype.getWatchingCreature = function (index) {
    var batch = this.currentCreatureBatch;
    if (!batch.length) return null;
    return batch[Utils.clamp(index, 0, batch.length - 1)];
  };

  Evolution.prototype.getRecordingForGeneration = function (generation) {
    for (var i = this.recordings.length - 1; i >= 0; i--) {
      if (this.recordings[i].generation === generation) return this.recordings[i];
    }
    return null;
  };

  EVO.Evolution = Evolution;
  EVO.FIXED_TIMESTEP = FIXED_TIMESTEP;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
