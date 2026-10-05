/*
 * Evolution (Web Edition) — core/data.js
 * ---------------------------------------------------------------
 * Port of the data model of the original Unity project:
 *   Assets/Scripts/Data/JointData.cs
 *   Assets/Scripts/Data/BoneData.cs
 *   Assets/Scripts/Data/MuscleData.cs
 *   Assets/Scripts/Data/DecorationData.cs
 *   Assets/Scripts/Data/CreatureDesign.cs
 *   Assets/Scripts/Data/CreatureStats.cs
 *   Assets/Scripts/Data/ChromosomeData.cs
 *   Assets/Scripts/Data/SimulationSettings.cs
 *   Assets/Scripts/Data/SimulationData.cs
 *   Assets/Scripts/Data/CreatureRecording.cs
 *
 * All of the JSON encodings are compatible with the original save files,
 * so creature designs and simulations created with the Unity version can be
 * imported into the web edition and vice versa.
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});
  var Utils = EVO.Utils;

  /* ------------------------------------------------------------------ *
   * JointData
   * ------------------------------------------------------------------ */
  var JointData = {
    create: function (id, position, weight, penalty) {
      return {
        id: id,
        x: position.x,
        y: position.y,
        weight: weight === undefined ? 1 : weight,
        fitnessPenaltyForTouchingGround: penalty === undefined ? 0 : penalty,
      };
    },

    encode: function (data) {
      var json = {
        id: data.id,
        x: Utils.round4(data.x),
        y: Utils.round4(data.y),
        weight: Utils.round4(data.weight),
      };
      if (data.fitnessPenaltyForTouchingGround) {
        json.penalty = Utils.round4(data.fitnessPenaltyForTouchingGround);
      }
      return json;
    },

    decode: function (json) {
      return JointData.create(
        json.id,
        { x: json.x, y: json.y },
        json.weight,
        json.penalty === undefined ? 0 : json.penalty
      );
    },
  };

  /* ------------------------------------------------------------------ *
   * BoneData
   * ------------------------------------------------------------------ */
  var BoneData = {
    create: function (id, startJointID, endJointID, weight, isWing, inverted, legacy, wingChord) {
      return {
        id: id,
        startJointID: startJointID,
        endJointID: endJointID,
        weight: weight === undefined ? 1 : weight,
        isWing: !!isWing,
        inverted: !!inverted,
        legacy: legacy === undefined ? false : !!legacy,
        wingChord: wingChord === undefined ? 1 : Math.max(0.1, wingChord),
      };
    },

    encode: function (data) {
      var json = {
        id: data.id,
        startJointID: data.startJointID,
        endJointID: data.endJointID,
        weight: Utils.round4(data.weight),
        legacy: !!data.legacy,
      };
      if (data.isWing) {
        json.wing = true;
        if (data.wingChord !== undefined && data.wingChord !== 1) {
          json.wingChord = Utils.round4(data.wingChord);
        }
      }
      if (data.inverted) json.inverted = true;
      return json;
    },

    decode: function (json) {
      return BoneData.create(
        json.id,
        json.startJointID,
        json.endJointID,
        json.weight,
        !!json.wing,
        !!json.inverted,
        json.legacy === undefined ? true : !!json.legacy,
        json.wingChord === undefined ? 1 : json.wingChord
      );
    },
  };

  /* ------------------------------------------------------------------ *
   * MuscleData
   * ------------------------------------------------------------------ */
  var MuscleData = {
    create: function (id, startBoneID, endBoneID, strength, canExpand, userId) {
      return {
        id: id,
        startBoneID: startBoneID,
        endBoneID: endBoneID,
        strength: strength === undefined ? 1500 : strength,
        canExpand: canExpand === undefined ? true : !!canExpand,
        userId: userId === undefined ? '' : userId,
      };
    },

    encode: function (data) {
      var json = {
        id: data.id,
        startBoneID: data.startBoneID,
        endBoneID: data.endBoneID,
        strength: Utils.round4(data.strength),
        canExpand: !!data.canExpand,
      };
      if (data.userId) json.userID = data.userId;
      return json;
    },

    decode: function (json) {
      return MuscleData.create(
        json.id,
        json.startBoneID,
        json.endBoneID,
        json.strength,
        json.canExpand,
        json.userID === undefined ? '' : json.userID
      );
    },
  };

  /* ------------------------------------------------------------------ *
   * Decorations (v4) — purely cosmetic body parts
   * ------------------------------------------------------------------ */
  var DecorationType = {
    GooglyEye: 0,
    ShiftyEyes: 1,
    EmptyEyeOval: 2,
    EmptyEyeCircle: 3,
    EmptyEyeRounded: 4,
    EmptyEyeSlanted: 5,
    EmptyEyeHappy: 6,
    PupilDot: 7,
    PupilTriangleCut: 8,
    PupilReflection: 9,
    EyebrowNormal: 10,
    EyebrowRaised: 11,
    EyebrowAngry: 12,
    MouthSmile: 13,
    MouthLaugh: 14,
    MouthLipSmile: 15,
    MouthWorried: 16,
    MouthLips: 17,
    MouthLipsSmall: 18,
    MouthTongue: 19,
    NoseBigFront: 20,
    NoseRaised: 21,
    NoseSmall: 22,
    NoseCrooked: 23,
    NoseDroopy: 24,
    Moustache1: 25,
    Moustache2: 26,
    Moustache3: 27,
    EarSide: 28,
    EarFront: 29,
    HandOpenPalm: 30,
    HandBack: 31,
    Fist: 32,
    Foot: 33,
    Shoe: 34,
    ShoeHighHeel: 35,
    ShoeCartoon: 36,
    Brain: 37,
    Bone: 38,
    CatEar: 39,
    CatWhiskers: 40,
    CatSnout: 41,
  };

  var DecorationTypeNames = [
    'Googly Eye',
    'Shifty Eyes',
    'Eye Oval',
    'Eye Circle',
    'Eye Rounded',
    'Eye Slanted',
    'Eye Happy',
    'Pupil Dot',
    'Pupil Triangle',
    'Pupil Reflection',
    'Eyebrow Normal',
    'Eyebrow Raised',
    'Eyebrow Angry',
    'Mouth Smile',
    'Mouth Laugh',
    'Mouth Lip Smile',
    'Mouth Worried',
    'Mouth Lips',
    'Mouth Lips Small',
    'Mouth Tongue',
    'Nose Big',
    'Nose Raised',
    'Nose Small',
    'Nose Crooked',
    'Nose Droopy',
    'Moustache 1',
    'Moustache 2',
    'Moustache 3',
    'Ear Side',
    'Ear Front',
    'Hand Open',
    'Hand Back',
    'Fist',
    'Foot',
    'Shoe',
    'High Heel',
    'Cartoon Shoe',
    'Brain',
    'Bone',
    'Cat Ear',
    'Cat Whiskers',
    'Cat Snout',
  ];

  var DecorationData = {
    /** The raw decorations of the original are scaled into their world size. */
    MAX_VALUE_RAW_VALUE: DecorationTypeNames.length - 1,

    create: function (id, boneId, offset, scale, rotation, flipX, flipY, decorationType) {
      return {
        id: id,
        boneId: boneId,
        offset: { x: offset.x, y: offset.y },
        scale: scale === undefined ? 1 : scale,
        rotation: rotation === undefined ? 0 : rotation,
        flipX: !!flipX,
        flipY: !!flipY,
        decorationType: decorationType === undefined ? 0 : decorationType,
      };
    },

    encode: function (data) {
      return {
        id: data.id,
        boneId: data.boneId,
        x: Utils.round4(data.offset.x),
        y: Utils.round4(data.offset.y),
        scale: Utils.round4(data.scale),
        rotation: Utils.round4(data.rotation),
        flipX: !!data.flipX,
        flipY: !!data.flipY,
        type: data.decorationType,
      };
    },

    decode: function (json) {
      return DecorationData.create(
        json.id,
        json.boneId,
        { x: json.x === undefined ? 0 : json.x, y: json.y === undefined ? 0 : json.y },
        json.scale === undefined ? 1 : json.scale,
        json.rotation === undefined ? 0 : json.rotation,
        !!json.flipX,
        !!json.flipY,
        json.type === undefined ? 0 : json.type
      );
    },

    nameForType: function (type) {
      return DecorationTypeNames[type] || 'Decoration';
    },
  };

  /* ------------------------------------------------------------------ *
   * CreatureDesign
   * ------------------------------------------------------------------ */
  var CreatureDesign = {
    create: function (name, joints, bones, muscles, decorations) {
      return {
        Version: 2,
        name: name || 'Unnamed',
        joints: joints || [],
        bones: bones || [],
        muscles: muscles || [],
        decorations: decorations || [],
      };
    },

    empty: function () {
      return CreatureDesign.create('', [], [], [], []);
    },

    isEmpty: function (design) {
      return !design || design.joints.length === 0;
    },

    encode: function (design) {
      return {
        name: design.name,
        joints: design.joints.map(JointData.encode),
        bones: design.bones.map(BoneData.encode),
        muscles: design.muscles.map(MuscleData.encode),
        decorations: design.decorations.map(DecorationData.encode),
      };
    },

    decode: function (json) {
      if (!json) return CreatureDesign.empty();
      if (typeof json === 'string') {
        if (!json) return CreatureDesign.empty();
        json = JSON.parse(json);
      }
      return CreatureDesign.create(
        json.name === undefined ? 'Unnamed' : json.name,
        (json.joints || []).map(JointData.decode),
        (json.bones || []).map(BoneData.decode),
        (json.muscles || []).map(MuscleData.decode),
        (json.decorations || []).map(DecorationData.decode)
      );
    },

    /** Deep clone — used for the undo history. */
    clone: function (design) {
      return CreatureDesign.decode(CreatureDesign.encode(design));
    },

    nextFreeId: function (design) {
      var maxId = 0;
      var consider = function (list) {
        list.forEach(function (entry) {
          if (entry.id > maxId) maxId = entry.id;
        });
      };
      consider(design.joints);
      consider(design.bones);
      consider(design.muscles);
      consider(design.decorations);
      return maxId + 1;
    },
  };

  /* ------------------------------------------------------------------ *
   * CreatureStats
   * ------------------------------------------------------------------ */
  var CreatureStats = {
    create: function () {
      return {
        unclampedFitness: 0,
        fitness: 0,
        simulationTime: -1,
        horizontalDistanceTravelled: 0,
        verticalDistanceTravelled: 0,
        maxJumpingHeight: 0,
        weight: 0,
        numberOfBones: 0,
        numberOfMuscles: 0,
        averageSpeed: 0,
      };
    },

    encode: function (stats) {
      return {
        unclampedFitness: Utils.round4(stats.unclampedFitness),
        fitness: Utils.round4(stats.fitness),
        simulationTime: stats.simulationTime,
        horizontalDistanceTravelled: Utils.round4(stats.horizontalDistanceTravelled),
        verticalDistanceTravelled: Utils.round4(stats.verticalDistanceTravelled),
        maxJumpHeight: Utils.round4(stats.maxJumpingHeight),
        weight: Utils.round4(stats.weight),
        numberOfBones: stats.numberOfBones,
        numberOfMuscles: stats.numberOfMuscles,
        averageSpeed: Utils.round4(stats.averageSpeed),
      };
    },

    decode: function (json) {
      if (typeof json === 'string') json = JSON.parse(json);
      var stats = CreatureStats.create();
      stats.unclampedFitness =
        json.unclampedFitness === undefined ? json.fitness : json.unclampedFitness;
      stats.fitness = json.fitness;
      stats.simulationTime = json.simulationTime;
      stats.horizontalDistanceTravelled = json.horizontalDistanceTravelled;
      stats.verticalDistanceTravelled = json.verticalDistanceTravelled;
      stats.maxJumpingHeight = json.maxJumpHeight || 0;
      stats.weight = json.weight || 0;
      stats.numberOfBones = json.numberOfBones || 0;
      stats.numberOfMuscles = json.numberOfMuscles || 0;
      stats.averageSpeed = json.averageSpeed || 0;
      return stats;
    },
  };

  /* ------------------------------------------------------------------ *
   * ChromosomeData
   * ------------------------------------------------------------------ */
  var ChromosomeData = {
    create: function (chromosome, stats) {
      return { chromosome: chromosome, stats: stats };
    },

    encode: function (data) {
      // Rounding the weights keeps the save files reasonably small.
      return {
        chromosome: data.chromosome.map(function (value) {
          return Math.round(value * 10000) / 10000;
        }),
        stats: CreatureStats.encode(data.stats),
      };
    },

    decode: function (json) {
      return ChromosomeData.create(json.chromosome, CreatureStats.decode(json.stats));
    },
  };

  /* ------------------------------------------------------------------ *
   * SimulationSettings
   * ------------------------------------------------------------------ */
  var SimulationSettings = {
    // Ranges of the settings UI (SettingsView / SimulationSettingsManager)
    MIN_SIMULATION_TIME: 5,
    MAX_SIMULATION_TIME: 60,
    MIN_POPULATION_SIZE: 2,
    MAX_POPULATION_SIZE: 100,
    MIN_BATCH_SIZE: 2,
    MAX_BATCH_SIZE: 50,

    defaultSettings: function () {
      return {
        Objective: EVO.Objective.Running,
        KeepBestCreatures: true,
        SimulationTime: 10,
        PopulationSize: 10,
        BatchSize: 10,
        SimulateInBatches: false,
        MutationRate: 0.5,
        SelectionAlgorithm: EVO.SelectionAlgorithm.RankProportional,
        RecombinationAlgorithm: EVO.RecombinationAlgorithm.OnePointCrossover,
        MutationAlgorithm: EVO.MutationAlgorithm.Global,
      };
    },

    forObjective: function (objective) {
      var settings = SimulationSettings.defaultSettings();
      settings.Objective = objective;
      return settings;
    },

    encode: function (settings) {
      return {
        keepBestCreatures: !!settings.KeepBestCreatures,
        simulationTime: settings.SimulationTime,
        populationSize: settings.PopulationSize,
        simulateInBatches: !!settings.SimulateInBatches,
        batchSize: settings.BatchSize,
        objective: settings.Objective,
        mutationRate: settings.MutationRate,
        selectionAlgorithm: settings.SelectionAlgorithm,
        recombinationAlgorithm: settings.RecombinationAlgorithm,
        mutationAlgorithm: settings.MutationAlgorithm,
      };
    },

    decode: function (json) {
      if (!json) return SimulationSettings.defaultSettings();
      if (typeof json === 'string') {
        if (!json) return SimulationSettings.defaultSettings();
        json = JSON.parse(json);
      }
      var settings = SimulationSettings.defaultSettings();
      if (json.keepBestCreatures !== undefined) settings.KeepBestCreatures = !!json.keepBestCreatures;
      if (json.simulationTime !== undefined) settings.SimulationTime = json.simulationTime;
      if (json.populationSize !== undefined) settings.PopulationSize = json.populationSize;
      if (json.simulateInBatches !== undefined) settings.SimulateInBatches = !!json.simulateInBatches;
      if (json.batchSize !== undefined) settings.BatchSize = json.batchSize;
      var objective = json.objective === undefined ? json.task : json.objective;
      if (objective !== undefined) settings.Objective = objective;
      if (json.mutationRate !== undefined) settings.MutationRate = json.mutationRate;
      if (json.selectionAlgorithm !== undefined) settings.SelectionAlgorithm = json.selectionAlgorithm;
      if (json.recombinationAlgorithm !== undefined)
        settings.RecombinationAlgorithm = json.recombinationAlgorithm;
      if (json.mutationAlgorithm !== undefined) settings.MutationAlgorithm = json.mutationAlgorithm;
      return SimulationSettings.clamp(settings);
    },

    clamp: function (settings) {
      settings.SimulationTime = Utils.clamp(
        Math.round(settings.SimulationTime),
        SimulationSettings.MIN_SIMULATION_TIME,
        SimulationSettings.MAX_SIMULATION_TIME
      );
      settings.PopulationSize = Utils.clamp(
        Math.round(settings.PopulationSize),
        SimulationSettings.MIN_POPULATION_SIZE,
        SimulationSettings.MAX_POPULATION_SIZE
      );
      settings.BatchSize = Utils.clamp(
        Math.round(settings.BatchSize),
        SimulationSettings.MIN_BATCH_SIZE,
        SimulationSettings.MAX_BATCH_SIZE
      );
      if (settings.BatchSize > settings.PopulationSize) settings.BatchSize = settings.PopulationSize;
      settings.MutationRate = Utils.clamp(settings.MutationRate, 0.01, 1);
      return settings;
    },
  };

  /* ------------------------------------------------------------------ *
   * SimulationData
   * ------------------------------------------------------------------ */
  var SimulationData = {
    VERSION: 3,

    create: function (settings, networkSettings, design, sceneDescription) {
      return {
        Version: SimulationData.VERSION,
        Settings: settings,
        NetworkSettings: networkSettings,
        CreatureDesign: design,
        SceneDescription: sceneDescription,
        BestCreatures: [],
        CurrentChromosomes: [],
        LastV2SimulatedGeneration: 0,
        LibraryCreatureId: null,
      };
    },

    encode: function (data) {
      var json = {
        version: data.Version,
        simulationSettings: SimulationSettings.encode(data.Settings),
        networkSettings: EVO.NeuralNetworkSettings.encode(data.NetworkSettings),
        creatureDesign: CreatureDesign.encode(data.CreatureDesign),
        scene: data.SceneDescription ? EVO.SimulationSceneDescription.encode(data.SceneDescription) : null,
        bestCreatures: data.BestCreatures.map(ChromosomeData.encode),
        currentChromosomes: data.CurrentChromosomes,
        lastV2SimulationGeneration: data.LastV2SimulatedGeneration,
      };
      if (data.LibraryCreatureId) json.libraryCreatureId = data.LibraryCreatureId;
      return json;
    },

    decode: function (json) {
      if (typeof json === 'string') json = JSON.parse(json);
      var data = SimulationData.create(
        SimulationSettings.decode(json.simulationSettings),
        EVO.NeuralNetworkSettings.decode(json.networkSettings),
        CreatureDesign.decode(json.creatureDesign),
        json.scene ? EVO.SimulationSceneDescription.decode(json.scene) : null
      );
      data.BestCreatures = (json.bestCreatures || []).map(ChromosomeData.decode);
      data.CurrentChromosomes = json.currentChromosomes || [];
      data.LastV2SimulatedGeneration = json.lastV2SimulationGeneration || 0;
      data.LibraryCreatureId = json.libraryCreatureId || null;
      return data;
    },
  };

  /* ------------------------------------------------------------------ *
   * BrainProfile — one evolved action brain of a saved creature
   * ------------------------------------------------------------------ *
   * A creature in My Creatures keeps one profile per action (Running,
   * Jumping, Obstacle Jump, Climbing, Flying). `replayId` is deliberately
   * not encoded: it points at a Gallery recording in the local browser
   * storage and would dangle once the file is opened somewhere else.
   */
  var BrainProfile = {
    /** The storage key of an action brain: `Obstacle Jump` -> `obstacleJump`. */
    keyForObjective: function (objective) {
      var name = EVO.ObjectiveUtil.stringRepresentation(objective).replace(/[^a-z0-9]/gi, '');
      return name ? name.charAt(0).toLowerCase() + name.substr(1) : 'running';
    },

    /** Inverse of `keyForObjective`, used for files with an unkeyed brain list. */
    objectiveForKey: function (key) {
      return EVO.ObjectiveUtil.objectiveFromString(
        String(key).replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      );
    },

    create: function (task, generation, chromosome, networkSettings, scene, stats, lastV2Generation) {
      return {
        task: task === undefined ? null : task,
        generation: generation || 0,
        chromosome: chromosome || [],
        networkSettings: networkSettings || null,
        scene: scene || null,
        stats: stats || null,
        lastV2SimulatedGeneration: lastV2Generation || 0,
      };
    },

    encode: function (profile) {
      if (!profile || !profile.chromosome || !profile.chromosome.length) return null;
      return {
        task: profile.task,
        generation: profile.generation || 0,
        chromosome: profile.chromosome.map(function (weight) {
          return Utils.round4(weight);
        }),
        networkSettings: profile.networkSettings
          ? profile.networkSettings
          : EVO.NeuralNetworkSettings.encode(EVO.NeuralNetworkSettings.defaultSettings()),
        scene: profile.scene || null,
        stats: profile.stats || null,
        lastV2SimulatedGeneration: profile.lastV2SimulatedGeneration || 0,
      };
    },

    decode: function (json) {
      if (!json || typeof json !== 'object') return null;
      if (!json.chromosome || !json.chromosome.length) return null;
      return BrainProfile.create(
        json.task === undefined ? null : json.task,
        json.generation || 0,
        json.chromosome.slice(),
        json.networkSettings || null,
        json.scene || null,
        json.stats || null,
        json.lastV2SimulatedGeneration || 0
      );
    },

    /** Encodes a `{ running: profile, … }` map, dropping empty profiles. */
    encodeCollection: function (brains) {
      var json = {};
      var keys = brains ? Object.keys(brains) : [];
      for (var i = 0; i < keys.length; i++) {
        var encoded = BrainProfile.encode(brains[keys[i]]);
        if (encoded) json[keys[i]] = encoded;
      }
      return json;
    },

    /**
     * Normalizes exported brains back into the `{ running: profile, … }`
     * shape. Both a keyed map and a plain list are accepted, and the key is
     * always taken from the profile's own task so a renamed key cannot make a
     * brain unreachable.
     */
    decodeCollection: function (json) {
      var brains = {};
      var raw = json && json.brains;
      if (!raw) return brains;
      var pairs = Array.isArray(raw)
        ? raw.map(function (profile) {
            return { key: null, profile: profile };
          })
        : Object.keys(raw).map(function (key) {
            return { key: key, profile: raw[key] };
          });
      for (var i = 0; i < pairs.length; i++) {
        var profile = BrainProfile.decode(pairs[i].profile);
        if (!profile) continue;
        var key;
        if (profile.task !== null) {
          key = BrainProfile.keyForObjective(profile.task);
        } else {
          // A brain without a task falls back to its key, then to Running.
          var task = pairs[i].key
            ? BrainProfile.objectiveForKey(pairs[i].key)
            : EVO.Objective.Running;
          key = BrainProfile.keyForObjective(task);
        }
        if (key) brains[key] = profile;
      }
      return brains;
    },
  };

  /* ------------------------------------------------------------------ *
   * CreatureFile — a creature design exported together with its brains
   * ------------------------------------------------------------------ *
   * The top-level keys stay exactly those of a plain creature design, so the
   * Unity save files and older web editions keep reading exported creatures;
   * they simply ignore the additional `brains` entry.
   */
  var CreatureFile = {
    encode: function (design, brains) {
      var json = CreatureDesign.encode(design);
      var encodedBrains = BrainProfile.encodeCollection(brains);
      if (Object.keys(encodedBrains).length) json.brains = encodedBrains;
      return json;
    },

    /** Returns `{ design, brains }` — `brains` is `{}` for a design-only file. */
    decode: function (json) {
      if (typeof json === 'string') json = JSON.parse(json);
      return {
        design: CreatureDesign.decode(json),
        brains: BrainProfile.decodeCollection(json),
      };
    },

    countBrains: function (brains) {
      return brains ? Object.keys(brains).length : 0;
    },
  };

  /* ------------------------------------------------------------------ *
   * CreatureRecorder / CreatureRecording
   * ------------------------------------------------------------------ */
  var SAMPLES_PER_SECOND = 30;
  var SECONDS_PER_SAMPLE = 1.0 / SAMPLES_PER_SECOND;

  function CreatureRecorder(recordingDurationInSeconds, numberOfJoints, numberOfMuscles) {
    this.recordingDurationInSeconds = recordingDurationInSeconds;
    this.numberOfJoints = numberOfJoints;
    this.numberOfMuscles = numberOfMuscles;
    this.sampleCount = Math.max(1, SAMPLES_PER_SECOND * recordingDurationInSeconds);
    this.reset();
  }

  CreatureRecorder.prototype.reset = function () {
    this.currentSampleIndex = 0;
    this.jointPositions = [];
    this.muscleForces = [];
    for (var i = 0; i < this.sampleCount; i++) {
      var joints = new Array(this.numberOfJoints);
      for (var j = 0; j < this.numberOfJoints; j++) joints[j] = { x: 0, y: 0 };
      this.jointPositions.push(joints);
      this.muscleForces.push(new Array(this.numberOfMuscles).fill(0));
    }
  };

  CreatureRecorder.prototype.recordSample = function (time, jointPositions, muscleForces) {
    if (this.currentSampleIndex >= this.sampleCount) return;
    var index = this.currentSampleIndex++;
    for (var j = 0; j < this.numberOfJoints; j++) {
      this.jointPositions[index][j] = { x: jointPositions[j].x, y: jointPositions[j].y };
    }
    for (var m = 0; m < this.numberOfMuscles; m++) {
      this.muscleForces[index][m] = muscleForces[m];
    }
  };

  CreatureRecorder.prototype.toRecordingMovementData = function () {
    var validSampleCount = this.currentSampleIndex;
    var timestamps = new Array(validSampleCount);
    var jointPositions = [];
    var muscleForces = [];
    for (var j = 0; j < this.numberOfJoints; j++) {
      jointPositions.push(new Array(validSampleCount));
    }
    for (var m = 0; m < this.numberOfMuscles; m++) {
      muscleForces.push(new Array(validSampleCount).fill(0));
    }

    for (var i = 0; i < validSampleCount; i++) {
      var timestamp = i * SECONDS_PER_SAMPLE;
      timestamps[i] = timestamp;
      for (var jj = 0; jj < this.numberOfJoints; jj++) {
        jointPositions[jj][i] = this.jointPositions[i][jj];
      }
      for (var mm = 0; mm < this.numberOfMuscles; mm++) {
        muscleForces[mm][i] = this.muscleForces[i][mm];
      }
    }

    return {
      sampleTimestamps: timestamps,
      jointPositions: jointPositions,
      muscleForces: muscleForces,
    };
  };

  /**
   * Playback helper that interpolates between the recorded samples.
   */
  function CreatureRecordingPlayer(movementData, numberOfJoints, numberOfMuscles) {
    this.movementData = movementData;
    this.numberOfJoints = numberOfJoints;
    this.numberOfMuscles = numberOfMuscles;
    this.currentSampleIndex = 0;
    this.playbackStartTime = 0;
    this.playbackTime = 0;
    this.lastJointPositions = [];
    this.lastMuscleForces = [];
    for (var i = 0; i < numberOfJoints; i++) this.lastJointPositions.push({ x: 0, y: 0 });
    for (var m = 0; m < numberOfMuscles; m++) this.lastMuscleForces.push(0);
  }

  CreatureRecordingPlayer.prototype.getDuration = function () {
    var timestamps = this.movementData.sampleTimestamps;
    return timestamps.length ? timestamps[timestamps.length - 1] : 0;
  };

  CreatureRecordingPlayer.prototype.seekPlaybackToAbsoluteTime = function (time) {
    this.playbackTime = time;
    this.updateInterpolatedValues();
  };

  CreatureRecordingPlayer.prototype.seekPlaybackToTime = function (time) {
    this.playbackTime = time;
    this.updateInterpolatedValues();
  };

  CreatureRecordingPlayer.prototype.updateInterpolatedValues = function () {
    var timestamps = this.movementData.sampleTimestamps;
    var count = timestamps.length;
    if (count === 0) return;

    var time = this.playbackTime;
    // The recording can be shorter than the simulation time — then we hold
    // the last sample, just like the original recording player does.
    if (time >= timestamps[count - 1]) {
      this.sampleAt(count - 1, 1, count - 1);
      return;
    }
    if (time <= timestamps[0]) {
      this.sampleAt(0, 0, 0);
      return;
    }

    var index = this.currentSampleIndex;
    if (index >= count - 1 || timestamps[index] > time || timestamps[index + 1] < time) {
      // Binary search for the current sample segment.
      var low = 0,
        high = count - 1;
      while (low < high - 1) {
        var mid = (low + high) >> 1;
        if (timestamps[mid] <= time) low = mid;
        else high = mid;
      }
      index = low;
    }
    this.currentSampleIndex = index;

    var start = timestamps[index];
    var end = timestamps[index + 1];
    var t = end > start ? (time - start) / (end - start) : 0;
    this.sampleAt(index, t, index + 1);
  };

  CreatureRecordingPlayer.prototype.sampleAt = function (index, t, nextIndex) {
    for (var j = 0; j < this.numberOfJoints; j++) {
      var a = this.movementData.jointPositions[j][index];
      var b = t > 0 ? this.movementData.jointPositions[j][nextIndex] : a;
      var target = this.lastJointPositions[j];
      target.x = a.x + (b.x - a.x) * t;
      target.y = a.y + (b.y - a.y) * t;
    }
    for (var m = 0; m < this.numberOfMuscles; m++) {
      var fa = this.movementData.muscleForces[m][index];
      var fb = t > 0 ? this.movementData.muscleForces[m][nextIndex] : fa;
      this.lastMuscleForces[m] = fa + (fb - fa) * t;
    }
  };

  CreatureRecordingPlayer.prototype.getRecordedJointPosition = function (index) {
    return this.lastJointPositions[index];
  };

  CreatureRecordingPlayer.prototype.getRecordedMuscleForce = function (index) {
    return this.lastMuscleForces[index];
  };

  var CreatureRecording = {
    create: function (
      creatureDesign,
      sceneDescription,
      movementData,
      task,
      generation,
      stats,
      networkInputCount,
      networkOutputCount,
      networkSettings
    ) {
      return {
        creatureDesign: creatureDesign,
        sceneDescription: sceneDescription,
        movementData: movementData,
        task: task,
        generation: generation,
        stats: stats,
        networkInputCount: networkInputCount,
        networkOutputCount: networkOutputCount,
        networkSettings: networkSettings,
        date: new Date().toISOString(),
      };
    },

    encode: function (recording) {
      return {
        creatureDesign: CreatureDesign.encode(recording.creatureDesign),
        scene: recording.sceneDescription
          ? EVO.SimulationSceneDescription.encode(recording.sceneDescription)
          : null,
        movementData: {
          sampleTimestamps: recording.movementData.sampleTimestamps.map(function (t) {
            return Math.round(t * 1000) / 1000;
          }),
          jointPositions: recording.movementData.jointPositions.map(function (positions) {
            return positions.map(function (p) {
              return [Utils.round4(p.x), Utils.round4(p.y)];
            });
          }),
          muscleForces: recording.movementData.muscleForces.map(function (forces) {
            return forces.map(function (f) {
              return Math.round(f * 10) / 10;
            });
          }),
        },
        task: recording.task,
        generation: recording.generation,
        stats: CreatureStats.encode(recording.stats),
        networkInputCount: recording.networkInputCount,
        networkOutputCount: recording.networkOutputCount,
        networkSettings: EVO.NeuralNetworkSettings.encode(recording.networkSettings),
        date: recording.date,
      };
    },

    decode: function (json) {
      if (typeof json === 'string') json = JSON.parse(json);
      var movementData = {
        sampleTimestamps: json.movementData.sampleTimestamps,
        jointPositions: json.movementData.jointPositions.map(function (positions) {
          return positions.map(function (p) {
            return { x: p[0], y: p[1] };
          });
        }),
        muscleForces: json.movementData.muscleForces,
      };
      var recording = CreatureRecording.create(
        CreatureDesign.decode(json.creatureDesign),
        json.scene ? EVO.SimulationSceneDescription.decode(json.scene) : null,
        movementData,
        json.task,
        json.generation,
        CreatureStats.decode(json.stats),
        json.networkInputCount,
        json.networkOutputCount,
        EVO.NeuralNetworkSettings.decode(json.networkSettings)
      );
      recording.date = json.date || recording.date;
      return recording;
    },
  };

  EVO.JointData = JointData;
  EVO.BoneData = BoneData;
  EVO.MuscleData = MuscleData;
  EVO.DecorationType = DecorationType;
  EVO.DecorationTypeNames = DecorationTypeNames;
  EVO.DecorationData = DecorationData;
  EVO.CreatureDesign = CreatureDesign;
  EVO.CreatureStats = CreatureStats;
  EVO.ChromosomeData = ChromosomeData;
  EVO.BrainProfile = BrainProfile;
  EVO.CreatureFile = CreatureFile;
  EVO.SimulationSettings = SimulationSettings;
  EVO.SimulationData = SimulationData;
  EVO.CreatureRecorder = CreatureRecorder;
  EVO.CreatureRecordingPlayer = CreatureRecordingPlayer;
  EVO.CreatureRecording = CreatureRecording;
  EVO.SAMPLES_PER_SECOND = SAMPLES_PER_SECOND;
  EVO.SECONDS_PER_SAMPLE = SECONDS_PER_SAMPLE;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
