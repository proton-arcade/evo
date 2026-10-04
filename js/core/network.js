/*
 * Evolution (Web Edition) — core/network.js
 * ---------------------------------------------------------------
 * Port of the neural network of the original Unity project:
 *   Assets/Scripts/Data/FeedForwardNetwork.cs
 *   Assets/Scripts/Data/NeuralNetworkSettings.cs
 *   Assets/Scripts/Util/MatrixUtils.cs
 *   Assets/Scripts/Util/ConversionUtils.cs
 *
 * A feed forward network with sigmoid activation functions.  The chromosome
 * (also called "genome") of a creature is the flattened list of all weights,
 * stored layer by layer, row by row.
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});
  var Utils = EVO.Utils;
  var Store = EVO.Store;

  var MIN_WEIGHT = -3.0;
  var MAX_WEIGHT = 3.0;

  /* ------------------------------------------------------------------ *
   * NeuralNetworkSettings
   * ------------------------------------------------------------------ */
  var NeuralNetworkSettings = {
    MAX_LAYERS: 10,
    MAX_NODES_PER_LAYER: 100,

    /** Creates the setting struct: only the intermediate layer sizes. */
    create: function (nodesPerIntermediateLayer) {
      return {
        NodesPerIntermediateLayer:
          nodesPerIntermediateLayer && nodesPerIntermediateLayer.length
            ? nodesPerIntermediateLayer.slice()
            : [10],
      };
    },

    /** The default network: 10 nodes in a single hidden layer. */
    defaultSettings: function () {
      return NeuralNetworkSettings.create([10]);
    },

    encode: function (settings) {
      return { NodesPerIntermediateLayer: settings.NodesPerIntermediateLayer.slice() };
    },

    decode: function (json) {
      if (!json) return NeuralNetworkSettings.defaultSettings();
      if (typeof json === 'string') {
        json = JSON.parse(json);
      }
      var nodes = json.NodesPerIntermediateLayer;
      if (!nodes || !nodes.length) return NeuralNetworkSettings.defaultSettings();
      return NeuralNetworkSettings.create(
        nodes.map(function (n) {
          return Utils.clamp(Math.round(n), 1, NeuralNetworkSettings.MAX_NODES_PER_LAYER);
        })
      );
    },

    /** Serializes the settings the same way the original v3 save file does. */
    encodeString: function (settings) {
      return JSON.stringify(settings.NodesPerIntermediateLayer.slice(0, NeuralNetworkSettings.MAX_LAYERS));
    },

    decodeString: function (encoded) {
      if (!encoded) return NeuralNetworkSettings.defaultSettings();
      try {
        if (encoded.charAt(0) === '[') {
          return NeuralNetworkSettings.create(JSON.parse(encoded));
        }
        if (encoded.charAt(0) === '{') {
          return NeuralNetworkSettings.decode(JSON.parse(encoded));
        }
        // Legacy v1 format: "10#10#..."
        return NeuralNetworkSettings.create(
          encoded.split('#').map(function (value) {
            return parseInt(value, 10);
          })
        );
      } catch (e) {
        return NeuralNetworkSettings.defaultSettings();
      }
    },

    /** The number of intermediate layers, clamped to the maximum. */
    numberOfIntermediateLayers: function (settings) {
      return Math.min(settings.NodesPerIntermediateLayer.length, NeuralNetworkSettings.MAX_LAYERS);
    },
  };

  /* ------------------------------------------------------------------ *
   * FeedForwardNetwork
   * ------------------------------------------------------------------ */
  function FeedForwardNetwork(inputCount, outputCount, settings, chromosome) {
    var layerCount = NeuralNetworkSettings.numberOfIntermediateLayers(settings) + 2;
    this.layerSizes = new Array(layerCount);
    this.layerSizes[0] = inputCount;
    this.layerSizes[layerCount - 1] = outputCount;
    for (var i = 1; i < layerCount - 1; i++) {
      this.layerSizes[i] = settings.NodesPerIntermediateLayer[i - 1];
    }

    this.inputs = new Float64Array(inputCount);

    var weightCount = this.getTotalWeightCount();
    this.weightCount = weightCount;

    if (chromosome && chromosome.length >= weightCount && weightCount > 0) {
      this.weights = this.weightsFromFlatArray(chromosome);
    } else {
      this.weights = this.setupRandomWeights();
    }

    // Scratch buffers to avoid allocations in the hot loop.
    this.tempResults = [];
    for (var layer = 0; layer < this.weights.length; layer++) {
      this.tempResults.push(new Float64Array(this.layerSizes[layer + 1]));
    }
    this._outputBuffer = new Float64Array(outputCount);
  }

  FeedForwardNetwork.MIN_WEIGHT = MIN_WEIGHT;
  FeedForwardNetwork.MAX_WEIGHT = MAX_WEIGHT;

  FeedForwardNetwork.prototype.getTotalWeightCount = function () {
    var total = 0;
    for (var i = 0; i < this.layerSizes.length - 1; i++) {
      total += this.layerSizes[i] * this.layerSizes[i + 1];
    }
    return total;
  };

  FeedForwardNetwork.prototype.setupRandomWeights = function () {
    var weights = [];
    for (var i = 0; i < this.layerSizes.length - 1; i++) {
      var rows = this.layerSizes[i];
      var cols = this.layerSizes[i + 1];
      var matrix = new Float64Array(rows * cols);
      for (var index = 0; index < matrix.length; index++) {
        matrix[index] = Utils.randomRange(MIN_WEIGHT, MAX_WEIGHT);
      }
      weights.push(matrix);
    }
    return weights;
  };

  FeedForwardNetwork.prototype.weightsFromFlatArray = function (flat) {
    var weights = [];
    var offset = 0;
    for (var i = 0; i < this.layerSizes.length - 1; i++) {
      var count = this.layerSizes[i] * this.layerSizes[i + 1];
      var matrix = new Float64Array(count);
      for (var index = 0; index < count; index++) {
        matrix[index] = flat[offset + index] || 0;
      }
      offset += count;
      weights.push(matrix);
    }
    return weights;
  };

  /** Flattens the weights into a chromosome (row-major, layer by layer). */
  FeedForwardNetwork.prototype.toFloatArray = function () {
    var result = new Array(this.getTotalWeightCount());
    var index = 0;
    for (var layer = 0; layer < this.weights.length; layer++) {
      var matrix = this.weights[layer];
      for (var i = 0; i < matrix.length; i++) {
        result[index++] = matrix[i];
      }
    }
    return result;
  };

  FeedForwardNetwork.prototype.numberOfInputs = function () {
    return this.layerSizes[0];
  };

  FeedForwardNetwork.prototype.numberOfOutputs = function () {
    return this.layerSizes[this.layerSizes.length - 1];
  };

  /** The activations of the input layer. */
  FeedForwardNetwork.prototype.getInputs = function () {
    return this.inputs;
  };

  FeedForwardNetwork.prototype.calculateOutputs = function () {
    var result = this.inputs;
    for (var layer = 0; layer < this.weights.length; layer++) {
      var rows = this.layerSizes[layer];
      var cols = this.layerSizes[layer + 1];
      var matrix = this.weights[layer];
      var output = this.tempResults[layer];

      for (var col = 0; col < cols; col++) {
        var sum = 0;
        for (var row = 0; row < rows; row++) {
          sum += matrix[row * cols + col] * result[row];
        }
        // Sigmoid activation
        output[col] = 1 / (1 + Math.exp(-sum));
      }

      // The output of this layer is the input of the next one.
      result = output;
    }
    return result;
  };

  FeedForwardNetwork.sigmoid = function (x) {
    return 1 / (1 + Math.exp(-x));
  };

  /* --- Encoding helpers matching the original binary string format ------- */

  FeedForwardNetwork.prototype.toBinaryString = function () {
    if (this.numberOfOutputs() === 0) return '';
    var builder = '';
    var floats = this.toFloatArray();
    for (var i = 0; i < floats.length; i++) {
      builder += floatToBinaryString(floats[i]);
    }
    return builder;
  };

  FeedForwardNetwork.fromBinaryString = function (inputCount, outputCount, settings, encoded) {
    var size = 0;
    var layerSizes = [inputCount];
    var intermediates = NeuralNetworkSettings.numberOfIntermediateLayers(settings);
    for (var i = 0; i < intermediates; i++) {
      layerSizes.push(settings.NodesPerIntermediateLayer[i]);
    }
    layerSizes.push(outputCount);
    for (var l = 0; l < layerSizes.length - 1; l++) {
      size += layerSizes[l] * layerSizes[l + 1];
    }
    var floats = new Array(size);
    for (var index = 0; index < size; index++) {
      floats[index] = binaryStringToFloat(encoded.substr(index * 32, 32));
    }
    return new FeedForwardNetwork(inputCount, outputCount, settings, floats);
  };

  function floatToBinaryString(value) {
    var buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    var view = new Uint8Array(buffer);
    var result = '';
    for (var i = 0; i < 4; i++) {
      for (var bit = 7; bit >= 0; bit--) {
        result += (view[i] >> bit) & 1 ? '1' : '0';
      }
    }
    return result;
  }

  function binaryStringToFloat(binary) {
    if (!binary || binary.length < 32) return 0;
    var bytes = new Uint8Array(4);
    for (var i = 0; i < 4; i++) {
      bytes[i] = parseInt(binary.substr(i * 8, 8), 2) & 0xff;
    }
    return new DataView(bytes.buffer).getFloat32(0, true);
  }

  FeedForwardNetwork._floatToBinaryString = floatToBinaryString;
  FeedForwardNetwork._binaryStringToFloat = binaryStringToFloat;

  /** Populates an array with random weights (used to seed a population). */
  FeedForwardNetwork.populateRandomWeights = function (weights) {
    for (var i = 0; i < weights.length; i++) {
      weights[i] = Utils.randomRange(MIN_WEIGHT, MAX_WEIGHT);
    }
    return weights;
  };

  /**
   * Computes the length of a chromosome for the given layer configuration —
   * the port of Evolution.CalculateChromosomeLengthForBrainType.
   */
  FeedForwardNetwork.chromosomeLength = function (numberOfInputs, numberOfOutputs, settings) {
    var intermediates = NeuralNetworkSettings.numberOfIntermediateLayers(settings);
    var totalLayerCount = intermediates + 2;
    var total = 0;
    for (var i = 0; i < totalLayerCount - 1; i++) {
      var inputNodes = i === 0 ? numberOfInputs : settings.NodesPerIntermediateLayer[i - 1];
      var outputNodes = i === totalLayerCount - 2 ? numberOfOutputs : settings.NodesPerIntermediateLayer[i];
      total += inputNodes * outputNodes;
    }
    return total;
  };

  EVO.NeuralNetworkSettings = NeuralNetworkSettings;
  EVO.FeedForwardNetwork = FeedForwardNetwork;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
