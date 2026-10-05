/*
 * Evolution (Web Edition) — core/customLibrary.js
 * ---------------------------------------------------------------
 * The logic behind the Custom Creatures screen: reading the creature files in
 * `cc/`, checking them, and grouping them into rows. No DOM in here.
 *
 * A browser cannot list a folder, so the files are found through a manifest,
 * `cc/index.json`, written by `node tools/scan-cc.js`. Files can also be dropped
 * onto the screen, which needs no tooling at all.
 *
 * A file only has to carry a design. Everything shown about it — counts, brain
 * chips, the poster — is derived when it is read. The creature's name falls
 * back to the file name.
 *
 * Validation has two levels. An *error* rejects the file, because loading it
 * would quietly build a different creature (a bone whose joint is missing is
 * dropped by the builder, a muscle with a missing bone is dropped, …). A
 * *warning* keeps the creature but leaves out the part that cannot work (a
 * brain whose weights do not fit this design).
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});

  var MANIFEST_NAME = 'index.json';
  var MANIFEST_PATH = 'cc/' + MANIFEST_NAME;

  /** `g8t7r.json` -> `g8t7r` */
  function stripExtension(filename) {
    return String(filename || '').replace(/\.json$/i, '');
  }

  function plural(count, noun) {
    return count + ' ' + noun + (count === 1 ? '' : 's');
  }

  /** Lists `a`, `a, b` or `a, b and c`-style, but capped to keep notices short. */
  function limitedList(items, limit) {
    limit = limit || 4;
    if (items.length <= limit) return items.join(', ');
    return items.slice(0, limit).join(', ') + ' and ' + (items.length - limit) + ' more';
  }

  /* ------------------------------------------------------------------ *
   * The manifest
   * ------------------------------------------------------------------ */
  /**
   * Reads `cc/index.json`. Accepts `{ "files": [...] }` or a bare array. Only
   * plain `*.json` file names in `cc/` are kept — no folders, no `..` — so the
   * manifest can never make the app fetch something outside the drop folder.
   * Returns `{ files, rejected }`.
   */
  function parseManifest(json) {
    var list = Array.isArray(json) ? json : json && Array.isArray(json.files) ? json.files : null;
    if (!list) throw new Error('The manifest should be { "files": ["name.json", …] }.');
    var files = [];
    var rejected = [];
    list.forEach(function (name) {
      var ok =
        typeof name === 'string' &&
        /^[^\\/:*?"<>|]+\.json$/i.test(name) &&
        name.charAt(0) !== '.' &&
        name.toLowerCase() !== MANIFEST_NAME;
      if (!ok) rejected.push(String(name));
      else if (files.indexOf(name) < 0) files.push(name);
    });
    return { files: files, rejected: rejected };
  }

  /* ------------------------------------------------------------------ *
   * Checking a design
   * ------------------------------------------------------------------ */
  function duplicateIds(list) {
    var seen = Object.create(null);
    var dupes = [];
    list.forEach(function (item) {
      if (seen[item.id] && dupes.indexOf(item.id) < 0) dupes.push(item.id);
      seen[item.id] = true;
    });
    return dupes;
  }

  /** Returns a list of problems that would make the builder produce a different creature. */
  function designErrors(design) {
    var errors = [];
    if (!design.joints.length) return ['It has no joints.'];

    var finite = design.joints.every(function (joint) {
      return isFinite(joint.x) && isFinite(joint.y);
    });
    if (!finite) errors.push('A joint has a position that is not a number.');

    [
      ['joint', design.joints],
      ['bone', design.bones],
      ['muscle', design.muscles],
    ].forEach(function (pair) {
      var dupes = duplicateIds(pair[1]);
      if (dupes.length) {
        errors.push(
          'Two ' + pair[0] + 's share an id (' + limitedList(dupes.map(String), 3) + ').'
        );
      }
    });

    var jointIds = Object.create(null);
    design.joints.forEach(function (joint) {
      jointIds[joint.id] = true;
    });
    var boneIds = Object.create(null);
    design.bones.forEach(function (bone) {
      boneIds[bone.id] = true;
    });

    var badBones = design.bones.filter(function (bone) {
      return !jointIds[bone.startJointID] || !jointIds[bone.endJointID];
    });
    if (badBones.length) {
      errors.push(
        plural(badBones.length, 'bone') +
          ' refer' + (badBones.length === 1 ? 's' : '') + ' to a joint that does not exist (bone ' +
          limitedList(badBones.map(function (bone) { return bone.id; }), 3) +
          ').'
      );
    }

    var badMuscles = design.muscles.filter(function (muscle) {
      return !boneIds[muscle.startBoneID] || !boneIds[muscle.endBoneID];
    });
    if (badMuscles.length) {
      errors.push(
        plural(badMuscles.length, 'muscle') +
          ' refer' + (badMuscles.length === 1 ? 's' : '') + ' to a bone that does not exist (muscle ' +
          limitedList(badMuscles.map(function (muscle) { return muscle.id; }), 3) +
          ').'
      );
    }

    var badDecorations = design.decorations.filter(function (decoration) {
      return !boneIds[decoration.boneId];
    });
    if (badDecorations.length) {
      errors.push(plural(badDecorations.length, 'decoration') + ' sit on a bone that does not exist.');
    }
    return errors;
  }

  /** Number of weights this design's network needs for a brain, or null if unknown here. */
  function expectedChromosomeLength(design, profile) {
    if (!EVO.Brains || !EVO.FeedForwardNetwork || !EVO.CalculateUniqueMusclesContext) return null;
    var musclesContext = EVO.CalculateUniqueMusclesContext(design.muscles);
    var brainType = EVO.Brains.brainTypeForSimulation(profile.task, profile.lastV2SimulatedGeneration || 0);
    var inputs = EVO.Brains.numberOfInputsForBrainType(brainType);
    var outputs = EVO.Brains.numberOfOutputsForBrainType(brainType, musclesContext);
    var settings = EVO.NeuralNetworkSettings.decode(profile.networkSettings);
    return EVO.FeedForwardNetwork.chromosomeLength(inputs, outputs, settings);
  }

  function fitnessOf(profile) {
    var fitness = profile.stats && profile.stats.fitness;
    return typeof fitness === 'number' && isFinite(fitness) ? fitness : null;
  }

  /**
   * Splits a file's brains into those that fit the design and warnings for the
   * rest. Returns `{ brains, list, warnings }`; `list` is in action order.
   */
  function checkBrains(design, brains) {
    var kept = {};
    var list = [];
    var warnings = [];
    EVO.ObjectiveUtil.ALL_OBJECTIVES.forEach(function (objective) {
      var key = EVO.BrainProfile.keyForObjective(objective);
      var profile = brains[key];
      if (!profile) return;
      var taskName = EVO.ObjectiveUtil.stringRepresentation(objective);

      var problem = null;
      var weights = profile.chromosome;
      if (
        !Array.isArray(weights) ||
        !weights.every(function (weight) {
          return typeof weight === 'number' && isFinite(weight);
        })
      ) {
        problem = 'its weights are not all numbers';
      } else {
        var expected = null;
        try {
          expected = expectedChromosomeLength(design, profile);
        } catch (error) {
          problem = 'its network settings are not valid';
        }
        if (!problem && expected !== null && weights.length !== expected) {
          problem = 'it has ' + weights.length + ' weights but this design needs ' + expected;
        }
      }
      if (problem) {
        warnings.push('The ' + taskName + ' brain was left out: ' + problem + '.');
        return;
      }
      kept[key] = profile;
      list.push({
        key: key,
        task: objective,
        taskName: taskName,
        generation: profile.generation || 0,
        fitness: fitnessOf(profile),
      });
    });
    return { brains: kept, list: list, warnings: warnings };
  }

  /* ------------------------------------------------------------------ *
   * Reading a file
   * ------------------------------------------------------------------ */
  /**
   * Parses and checks one creature file. Returns `{ ok: true, entry }` or
   * `{ ok: false, filename, errors }`. Never throws.
   */
  function parseFile(text, filename) {
    var fail = function (errors) {
      return { ok: false, filename: filename, errors: errors };
    };
    var json;
    try {
      json = typeof text === 'string' ? JSON.parse(text) : text;
    } catch (error) {
      return fail(['This is not valid JSON (' + error.message + ').']);
    }
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      return fail(['A creature file should be a JSON object with joints, bones and muscles.']);
    }

    var bundle;
    try {
      bundle = EVO.CreatureFile.decode(json);
    } catch (error) {
      return fail(['The design could not be read (' + error.message + ').']);
    }
    var design = bundle.design;
    var errors = designErrors(design);
    if (errors.length) return fail(errors);

    var rawName = typeof json.name === 'string' ? json.name.trim() : '';
    var name = rawName || stripExtension(filename) || 'Unnamed';
    design.name = name;

    var checked = checkBrains(design, bundle.brains);
    return {
      ok: true,
      entry: {
        id: filename,
        filename: filename,
        name: name,
        design: design,
        json: json,
        brains: checked.brains,
        brainList: checked.list,
        counts: {
          joints: design.joints.length,
          bones: design.bones.length,
          muscles: design.muscles.length,
        },
        warnings: checked.warnings,
      },
    };
  }

  /* ------------------------------------------------------------------ *
   * Text shown about an entry
   * ------------------------------------------------------------------ */
  function countsText(entry) {
    return (
      plural(entry.counts.joints, 'joint') +
      ' · ' +
      plural(entry.counts.bones, 'bone') +
      ' · ' +
      plural(entry.counts.muscles, 'muscle')
    );
  }

  /** `Running Gen 294 · Jumping Gen 252 · …` */
  function brainSummary(entry) {
    if (!entry.brainList.length) return 'No evolved brains in this file yet — simulate it to train one.';
    return entry.brainList
      .map(function (brain) {
        return brain.taskName + ' Gen ' + brain.generation;
      })
      .join(' · ');
  }

  /** The text of one chip in the Explore panel: `Running · Gen 294 · 0.1532` */
  function brainChipText(brain) {
    var text = brain.taskName + ' · Gen ' + brain.generation;
    if (brain.fitness !== null) text += ' · ' + brain.fitness.toFixed(4);
    return text;
  }

  /* ------------------------------------------------------------------ *
   * Rows
   * ------------------------------------------------------------------ */
  /** `All creatures`, then one `Has a … brain` row per action that someone has. */
  function buildRows(entries) {
    var rows = [];
    if (!entries.length) return rows;
    rows.push({ id: 'all', title: 'All creatures', entries: entries.slice() });
    EVO.ObjectiveUtil.ALL_OBJECTIVES.forEach(function (objective) {
      var key = EVO.BrainProfile.keyForObjective(objective);
      var matching = entries.filter(function (entry) {
        return !!entry.brains[key];
      });
      if (!matching.length) return;
      var name = EVO.ObjectiveUtil.stringRepresentation(objective);
      rows.push({
        id: key,
        title: 'Has a ' + name + ' brain',
        entries: matching,
      });
    });
    return rows;
  }

  /* ------------------------------------------------------------------ *
   * Copy to My Creatures
   * ------------------------------------------------------------------ */
  function sameDesign(a, b) {
    return JSON.stringify(EVO.CreatureDesign.encode(a)) === JSON.stringify(EVO.CreatureDesign.encode(b));
  }

  /**
   * Copies a creature, with its brains, into My Creatures through `storage`
   * (`EVO.Storage`). Safe to press twice: a saved creature with the same name
   * *and* the same design is reused rather than duplicated, and it only gains
   * the actions it has no brain for — brains the player trained further are
   * never overwritten. A same-named creature with a different design is a
   * different creature and is added next to it.
   *
   * Returns `{ id, created, added }` — `added` lists the action keys stored.
   */
  function copyToMyCreatures(entry, storage) {
    var design = EVO.CreatureDesign.clone(entry.design);
    design.name = entry.name;

    var existing = null;
    storage.getDesigns().some(function (saved) {
      if (saved.name === entry.name && sameDesign(saved.design, design)) {
        existing = saved;
        return true;
      }
      return false;
    });

    if (!existing) {
      var id = storage.saveDesign(design, null, entry.brains);
      return { id: id, created: true, added: Object.keys(entry.brains) };
    }

    var missing = {};
    Object.keys(entry.brains).forEach(function (key) {
      var objective = EVO.BrainProfile.objectiveForKey(key);
      if (!storage.getEvolvedBrain(existing, objective)) missing[key] = entry.brains[key];
    });
    var added = Object.keys(missing);
    if (added.length) storage.saveDesign(existing.design, existing.id, missing);
    return { id: existing.id, created: false, added: added };
  }

  EVO.CustomLibrary = {
    MANIFEST_PATH: MANIFEST_PATH,
    parseManifest: parseManifest,
    designErrors: designErrors,
    checkBrains: checkBrains,
    parseFile: parseFile,
    countsText: countsText,
    brainSummary: brainSummary,
    brainChipText: brainChipText,
    buildRows: buildRows,
    copyToMyCreatures: copyToMyCreatures,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
