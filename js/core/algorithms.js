/*
 * Evolution (Web Edition) — core/algorithms.js
 * ---------------------------------------------------------------
 * Port of the evolutionary operators of the original Unity project:
 *   Assets/Scripts/Util/Mutation.cs
 *   Assets/Scripts/Util/Recombination.cs
 *   Assets/Scripts/Util/Selection.cs
 *   Assets/Scripts/Data/Objective.cs
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});
  var Utils = EVO.Utils;
  var RandomPicker = EVO.RandomPicker;

  /* ------------------------------------------------------------------ *
   * Objectives (Data/Objective.cs)
   * ------------------------------------------------------------------ */
  var Objective = {
    Running: 0,
    Jumping: 1,
    ObstacleJump: 2,
    Climbing: 3,
    Flying: 4,
  };

  var ObjectiveUtil = {
    ALL_OBJECTIVES: [
      Objective.Running,
      Objective.Jumping,
      Objective.ObstacleJump,
      Objective.Climbing,
      Objective.Flying,
    ],

    stringRepresentation: function (objective) {
      switch (objective) {
        case Objective.Running:
          return 'Running';
        case Objective.Jumping:
          return 'Jumping';
        case Objective.ObstacleJump:
          return 'Obstacle Jump';
        case Objective.Climbing:
          return 'Climbing';
        case Objective.Flying:
          return 'Flying';
      }
      return 'Running';
    },

    objectiveFromString: function (string) {
      switch (String(string).toUpperCase()) {
        case 'RUNNING':
          return Objective.Running;
        case 'JUMPING':
          return Objective.Jumping;
        case 'OBSTACLE JUMP':
          return Objective.ObstacleJump;
        case 'CLIMBING':
          return Objective.Climbing;
        case 'FLYING':
          return Objective.Flying;
      }
      return Objective.Running;
    },

    getAllObjectiveNames: function () {
      return this.ALL_OBJECTIVES.map(this.stringRepresentation);
    },
  };

  /* ------------------------------------------------------------------ *
   * Mutation (Util/Mutation.cs)
   * ------------------------------------------------------------------ */
  var MutationAlgorithm = {
    /** Changes a random number of values at consecutive indices. */
    Chunk: 0,
    /** Changes the value at each index with a random probability. */
    Global: 1,
    /** Chooses a random start and end index and inverts the order of values inbetween. */
    Inversion: 2,
  };

  var mutationRandom = new EVO.GaussianPRNG();

  var Mutation = {
    /** Mutation of a single float value: nonlocal gaussian offset. */
    mutateValue: function (x) {
      return x + mutationRandom.next();
    },

    /** Mutation of a single binary character. */
    mutateChar: function (c) {
      if (c === '0') return '1';
      if (c === '1') return '0';
      throw new Error("Invalid input. Only '0' and '1' are supported");
    },

    /**
     * Mutates a float array in place and returns it.
     * The chromosome of a creature is the flattened list of all connection weights.
     */
    mutate: function (chromosome, mode) {
      switch (mode) {
        case MutationAlgorithm.Chunk:
          return this.mutateChunk(chromosome);
        case MutationAlgorithm.Inversion:
          return this.mutateInversion(chromosome);
        case MutationAlgorithm.Global:
        default:
          return this.mutateGlobal(chromosome);
      }
    },

    /**
     * Changes a contiguous chunk of 2-15 values at a random position.
     */
    mutateChunk: function (chromosome) {
      var length = chromosome.length;
      if (length === 0) return chromosome;

      var start = Utils.randomInt(0, length);
      var maxChunkLength = Utils.clamp(length - start, 1, 15);
      var chunkLength = Math.min(maxChunkLength, Utils.randomInt(2, 16));

      for (var i = start; i < start + chunkLength && i < length; i++) {
        chromosome[i] = this.mutateValue(chromosome[i]);
      }
      return chromosome;
    },

    /**
     * The value at each index is mutated with a 75% probability.
     */
    mutateGlobal: function (chromosome) {
      for (var i = 0; i < chromosome.length; i++) {
        if (Utils.randomInt(1, 100) > 25) {
          chromosome[i] = this.mutateValue(chromosome[i]);
        }
      }
      return chromosome;
    },

    /**
     * Inverts the order of a random subrange of the chromosome.
     */
    mutateInversion: function (chromosome) {
      var length = chromosome.length;
      if (length < 2) return chromosome;

      var start = Utils.randomInt(0, length);
      var end = Utils.randomInt(start, length);
      var mid = Math.floor((start + end) / 2);

      for (var i = start; i <= mid; i++) {
        var swapIndex = end - i + start;
        var temp = chromosome[i];
        chromosome[i] = chromosome[swapIndex];
        chromosome[swapIndex] = temp;
      }
      return chromosome;
    },
  };

  /* ------------------------------------------------------------------ *
   * Recombination (Util/Recombination.cs)
   * ------------------------------------------------------------------ */
  var RecombinationAlgorithm = {
    /** Cuts the parent chromosomes at the same random index. */
    OnePointCrossover: 0,
    /** Cuts the parent chromosomes at multiple random indices. */
    MultiPointCrossover: 1,
    /** Chooses each value at random from either parent chromosome. */
    UniformCrossover: 2,
  };

  var Recombination = {
    /**
     * Recombines two chromosomes into `result` (an array of length 2),
     * which is filled with the two children.  Both arrays must have the
     * same length.
     */
    recombine: function (lhs, rhs, result, algorithm) {
      if (lhs.length !== rhs.length) {
        throw new Error('The arrays to be recombined must both be of the same length.');
      }
      switch (algorithm) {
        case RecombinationAlgorithm.MultiPointCrossover:
          return this.recombineMultiPoint(lhs, rhs, result);
        case RecombinationAlgorithm.UniformCrossover:
          return this.recombineUniform(lhs, rhs, result);
        case RecombinationAlgorithm.OnePointCrossover:
        default:
          return this.recombineOnePoint(lhs, rhs, result);
      }
    },

    recombineOnePoint: function (lhs, rhs, result) {
      var length = lhs.length;
      var splitIndex = Utils.randomInt(1, Math.max(2, length));
      var result0 = new Array(length);
      var result1 = new Array(length);

      for (var i = 0; i < splitIndex; i++) {
        result0[i] = lhs[i];
        result1[i] = rhs[i];
      }
      for (var j = splitIndex; j < length; j++) {
        result0[j] = rhs[j];
        result1[j] = lhs[j];
      }

      result[0] = result0;
      result[1] = result1;
      return result;
    },

    recombineMultiPoint: function (lhs, rhs, result) {
      var length = lhs.length;
      var k = Math.min(length, 5);
      var lengthPerPart = Math.max(1, Math.floor(length / k));

      var result0 = new Array(length);
      var result1 = new Array(length);

      for (var i = 0; i < length; i++) {
        var swapIndex = Math.floor(i / lengthPerPart) % 2;
        if (swapIndex === 0) {
          result0[i] = lhs[i];
          result1[i] = rhs[i];
        } else {
          result0[i] = rhs[i];
          result1[i] = lhs[i];
        }
      }

      result[0] = result0;
      result[1] = result1;
      return result;
    },

    recombineUniform: function (lhs, rhs, result) {
      var length = lhs.length;
      var result0 = new Array(length);
      var result1 = new Array(length);

      for (var i = 0; i < length; i++) {
        var swapIndex = Utils.randomInt(0, 2);
        if (swapIndex === 0) {
          result0[i] = lhs[i];
          result1[i] = rhs[i];
        } else {
          result0[i] = rhs[i];
          result1[i] = lhs[i];
        }
      }

      result[0] = result0;
      result[1] = result1;
      return result;
    },
  };

  /* ------------------------------------------------------------------ *
   * Selection (Util/Selection.cs)
   * ------------------------------------------------------------------ */
  var SelectionAlgorithm = {
    Uniform: 0,
    FitnessProportional: 1,
    TournamentSelection: 2,
    RankProportional: 3,
  };

  /**
   * `elements` is a list of objects exposing `getFitness()`.
   */
  function Selection(mode, elements) {
    this.mode = mode;
    // Sorted in ascending order of fitness.
    this.elements = elements.slice().sort(function (lhs, rhs) {
      return lhs.getFitness() - rhs.getFitness();
    });
    this.random = new RandomPicker();
    this.setupPickingWeights(mode, this.elements);
  }

  Selection.prototype.setupPickingWeights = function (mode, elements) {
    var self = this;
    switch (mode) {
      case SelectionAlgorithm.FitnessProportional:
        elements.forEach(function (element) {
          self.random.add(element, Math.max(0.000001, element.getFitness()));
        });
        break;

      case SelectionAlgorithm.Uniform:
      case SelectionAlgorithm.TournamentSelection:
        elements.forEach(function (element) {
          self.random.add(element, 1);
        });
        break;

      case SelectionAlgorithm.RankProportional:
        for (var i = 0; i < elements.length; i++) {
          // The best (last) element gets the highest weight.
          this.random.add(elements[i], i);
        }
        break;
    }
  };

  /** Returns the best `n` solutions (highest fitness first). */
  Selection.prototype.selectBest = function (n) {
    var best = [];
    for (var i = this.elements.length - 1; i >= 0 && best.length < n; i--) {
      best.push(this.elements[i]);
    }
    return best;
  };

  Selection.prototype.select = function () {
    if (this.elements.length === 0) return undefined;

    if (this.mode === SelectionAlgorithm.TournamentSelection) {
      var sel1 = this.random.next();
      var sel2 = this.random.next();
      var sel3 = this.random.next();
      var fitness1 = sel1.getFitness();
      var fitness2 = sel2.getFitness();
      var fitness3 = sel3.getFitness();
      if (fitness1 > fitness2) {
        return fitness1 > fitness3 ? sel1 : sel3;
      }
      return fitness2 > fitness3 ? sel2 : sel3;
    }

    return this.random.next();
  };

  EVO.Objective = Objective;
  EVO.ObjectiveUtil = ObjectiveUtil;
  EVO.Mutation = Mutation;
  EVO.MutationAlgorithm = MutationAlgorithm;
  EVO.Recombination = Recombination;
  EVO.RecombinationAlgorithm = RecombinationAlgorithm;
  EVO.Selection = Selection;
  EVO.SelectionAlgorithm = SelectionAlgorithm;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
