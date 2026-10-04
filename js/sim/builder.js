/*
 * Evolution (Web Edition) — sim/builder.js
 * ---------------------------------------------------------------
 * Port of Assets/Scripts/Controllers/CreatureBuilder.cs — the model behind
 * the creature editor.  All editing operations work on a CreatureDesign and
 * return whether the design was modified.
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});
  var Utils = EVO.Utils;

  /** The minimum distance between two joints when they are placed. */
  var JOINT_NON_OVERLAP_RADIUS = 0.6;
  /** The thickness of a bone. */
  var CONNECTION_WIDTH = 0.5;

  function CreatureBuilder(design) {
    this.design = design ? EVO.CreatureDesign.decode(EVO.CreatureDesign.encode(design)) : EVO.CreatureDesign.empty();
    this.name = this.design.name === 'Unnamed' ? '' : this.design.name;
    this.idCounter = EVO.CreatureDesign.nextFreeId(this.design);
    // The component that is currently being placed.
    this.currentBone = null; // {id, startJointID, endJointID}
    this.currentMuscle = null;
    this.currentDecoration = null;
  }

  CreatureBuilder.JOINT_NON_OVERLAP_RADIUS = JOINT_NON_OVERLAP_RADIUS;
  CreatureBuilder.CONNECTION_WIDTH = CONNECTION_WIDTH;

  CreatureBuilder.prototype.design_ = function () {
    return this.design;
  };

  /* ------------------------------------------------------------------ *
   * Lookups
   * ------------------------------------------------------------------ */
  CreatureBuilder.prototype.findJoint = function (id) {
    for (var i = 0; i < this.design.joints.length; i++) {
      if (this.design.joints[i].id === id) return this.design.joints[i];
    }
    return null;
  };

  CreatureBuilder.prototype.findBone = function (id) {
    for (var i = 0; i < this.design.bones.length; i++) {
      if (this.design.bones[i].id === id) return this.design.bones[i];
    }
    return null;
  };

  CreatureBuilder.prototype.findMuscle = function (id) {
    for (var i = 0; i < this.design.muscles.length; i++) {
      if (this.design.muscles[i].id === id) return this.design.muscles[i];
    }
    return null;
  };

  CreatureBuilder.prototype.findDecoration = function (id) {
    for (var i = 0; i < this.design.decorations.length; i++) {
      if (this.design.decorations[i].id === id) return this.design.decorations[i];
    }
    return null;
  };

  CreatureBuilder.prototype.forEachBoneOfJoint = function (jointId, callback) {
    for (var i = 0; i < this.design.bones.length; i++) {
      var bone = this.design.bones[i];
      if (bone.startJointID === jointId || bone.endJointID === jointId) callback(bone);
    }
  };

  /* ------------------------------------------------------------------ *
   * Joints
   * ------------------------------------------------------------------ */
  CreatureBuilder.prototype.jointPositionIsClear = function (position, ignoredJoints) {
    for (var i = 0; i < this.design.joints.length; i++) {
      var joint = this.design.joints[i];
      if (ignoredJoints && ignoredJoints.indexOf(joint) !== -1) continue;
      if (Utils.distance(joint.x, joint.y, position.x, position.y) < JOINT_NON_OVERLAP_RADIUS) {
        return false;
      }
    }
    return true;
  };

  CreatureBuilder.prototype.tryPlacingJoint = function (position) {
    // Make sure the joint doesn't overlap another one.
    if (!this.jointPositionIsClear(position)) return false;
    this.design.joints.push(
      EVO.JointData.create(this.idCounter++, { x: position.x, y: position.y }, 1, 0)
    );
    return true;
  };

  /** Moves a joint. Returns the ids of the components that changed. */
  CreatureBuilder.prototype.moveJoint = function (id, position) {
    var joint = this.findJoint(id);
    if (!joint || !this.jointPositionIsClear(position, [joint])) return false;
    joint.x = position.x;
    joint.y = position.y;
    return true;
  };

  CreatureBuilder.prototype.moveJoints = function (ids, delta) {
    var movingJoints = [];
    for (var i = 0; i < ids.length; i++) {
      var joint = this.findJoint(ids[i]);
      if (joint && movingJoints.indexOf(joint) === -1) movingJoints.push(joint);
    }
    if (!movingJoints.length) return false;

    // Validate the whole translation before applying it so connected bones
    // cannot drag joints into another component or leave a partial move.
    for (var m = 0; m < movingJoints.length; m++) {
      var moving = movingJoints[m];
      if (
        !this.jointPositionIsClear(
          { x: moving.x + delta.x, y: moving.y + delta.y },
          movingJoints
        )
      ) {
        return false;
      }
    }

    movingJoints.forEach(function (joint) {
      joint.x += delta.x;
      joint.y += delta.y;
    });
    return true;
  };

  CreatureBuilder.prototype.setJointWeight = function (id, weight) {
    var joint = this.findJoint(id);
    if (!joint) return false;
    joint.weight = Utils.clamp(weight, 0.2, 5);
    return true;
  };

  CreatureBuilder.prototype.setJointPenalty = function (id, penalty) {
    var joint = this.findJoint(id);
    if (!joint) return false;
    joint.fitnessPenaltyForTouchingGround = Utils.clamp(penalty, 0, 1);
    return true;
  };

  /* ------------------------------------------------------------------ *
   * Bones
   * ------------------------------------------------------------------ */
  CreatureBuilder.prototype.tryStartingBone = function (jointId) {
    if (!this.findJoint(jointId)) return false;
    this.currentBone = {
      id: this.idCounter++,
      startJointID: jointId,
      endJointID: jointId,
    };
    return true;
  };

  CreatureBuilder.prototype.updateCurrentBoneEnd = function (jointId) {
    if (!this.currentBone) return false;
    if (jointId !== null && jointId !== undefined && jointId !== this.currentBone.startJointID) {
      this.currentBone.endJointID = jointId;
      return true;
    }
    this.currentBone.endJointID = this.currentBone.startJointID;
    return false;
  };

  CreatureBuilder.prototype.placeCurrentBone = function () {
    if (!this.currentBone) return false;
    if (
      this.currentBone.endJointID === this.currentBone.startJointID ||
      !this.findJoint(this.currentBone.endJointID) ||
      !this.findJoint(this.currentBone.startJointID)
    ) {
      this.currentBone = null;
      return false;
    }
    // Don't allow duplicate bones.
    var start = this.currentBone.startJointID;
    var end = this.currentBone.endJointID;
    for (var i = 0; i < this.design.bones.length; i++) {
      var bone = this.design.bones[i];
      if (
        (bone.startJointID === start && bone.endJointID === end) ||
        (bone.startJointID === end && bone.endJointID === start)
      ) {
        this.currentBone = null;
        return false;
      }
    }

    this.design.bones.push(
      EVO.BoneData.create(this.currentBone.id, start, end, 1, false, false, false)
    );
    this.currentBone = null;
    return true;
  };

  CreatureBuilder.prototype.cancelCurrentBone = function () {
    this.currentBone = null;
  };

  CreatureBuilder.prototype.setBoneWeight = function (id, weight) {
    var bone = this.findBone(id);
    if (!bone) return false;
    bone.weight = Utils.clamp(weight, 0.5, 5);
    return true;
  };

  CreatureBuilder.prototype.setBoneIsWing = function (id, isWing) {
    var bone = this.findBone(id);
    if (!bone) return false;
    bone.isWing = !!isWing;
    return true;
  };

  CreatureBuilder.prototype.setBoneInverted = function (id, inverted) {
    var bone = this.findBone(id);
    if (!bone) return false;
    bone.inverted = !!inverted;
    return true;
  };

  /* ------------------------------------------------------------------ *
   * Muscles
   * ------------------------------------------------------------------ */
  CreatureBuilder.prototype.tryStartingMuscle = function (boneId) {
    if (!this.findBone(boneId)) return false;
    this.currentMuscle = {
      id: this.idCounter++,
      startBoneID: boneId,
      endBoneID: boneId,
    };
    return true;
  };

  CreatureBuilder.prototype.updateCurrentMuscleEnd = function (boneId) {
    if (!this.currentMuscle) return false;
    if (boneId !== null && boneId !== undefined && boneId !== this.currentMuscle.startBoneID) {
      this.currentMuscle.endBoneID = boneId;
      return true;
    }
    this.currentMuscle.endBoneID = this.currentMuscle.startBoneID;
    return false;
  };

  CreatureBuilder.prototype.placeCurrentMuscle = function () {
    if (!this.currentMuscle) return false;
    if (
      this.currentMuscle.endBoneID === this.currentMuscle.startBoneID ||
      !this.findBone(this.currentMuscle.endBoneID) ||
      !this.findBone(this.currentMuscle.startBoneID)
    ) {
      this.currentMuscle = null;
      return false;
    }

    var start = this.currentMuscle.startBoneID;
    var end = this.currentMuscle.endBoneID;
    // Validate that the muscle doesn't exist already.
    for (var i = 0; i < this.design.muscles.length; i++) {
      var muscle = this.design.muscles[i];
      if (
        (muscle.startBoneID === start && muscle.endBoneID === end) ||
        (muscle.startBoneID === end && muscle.endBoneID === start)
      ) {
        this.currentMuscle = null;
        return false;
      }
    }

    this.design.muscles.push(
      EVO.MuscleData.create(this.currentMuscle.id, start, end, 1500, true, '')
    );
    this.currentMuscle = null;
    return true;
  };

  CreatureBuilder.prototype.cancelCurrentMuscle = function () {
    this.currentMuscle = null;
  };

  CreatureBuilder.prototype.setMuscleStrength = function (id, strength) {
    var muscle = this.findMuscle(id);
    if (!muscle) return false;
    muscle.strength = Utils.clamp(strength, 0, 4500);
    return true;
  };

  CreatureBuilder.prototype.setMuscleCanExpand = function (id, canExpand) {
    var muscle = this.findMuscle(id);
    if (!muscle) return false;
    muscle.canExpand = !!canExpand;
    return true;
  };

  CreatureBuilder.prototype.setMuscleUserId = function (id, userId) {
    var muscle = this.findMuscle(id);
    if (!muscle) return false;
    muscle.userId = String(userId === null || userId === undefined ? '' : userId).substr(0, 1000);
    return true;
  };

  /* ------------------------------------------------------------------ *
   * Decorations
   * ------------------------------------------------------------------ */
  CreatureBuilder.prototype.createDecorationFromBone = function (boneId, offset, type) {
    var bone = this.findBone(boneId);
    if (!bone) return null;
    var decoration = EVO.DecorationData.create(
      this.idCounter++,
      boneId,
      { x: offset ? offset.x : 0, y: offset ? offset.y : 0 },
      1,
      0,
      false,
      false,
      type
    );
    this.design.decorations.push(decoration);
    return decoration;
  };

  CreatureBuilder.prototype.setDecorationOffset = function (id, offset) {
    var decoration = this.findDecoration(id);
    if (!decoration) return false;
    decoration.offset.x = offset.x;
    decoration.offset.y = offset.y;
    return true;
  };

  CreatureBuilder.prototype.setDecorationScale = function (id, scale) {
    var decoration = this.findDecoration(id);
    if (!decoration) return false;
    decoration.scale = Utils.clamp(scale, 0.2, 4);
    return true;
  };

  CreatureBuilder.prototype.setDecorationRotation = function (id, rotation) {
    var decoration = this.findDecoration(id);
    if (!decoration) return false;
    decoration.rotation = rotation;
    return true;
  };

  CreatureBuilder.prototype.setDecorationFlip = function (id, flipX, flipY) {
    var decoration = this.findDecoration(id);
    if (!decoration) return false;
    decoration.flipX = !!flipX;
    decoration.flipY = !!flipY;
    return true;
  };

  /** Moves a decoration forwards or backwards in the render order. */
  CreatureBuilder.prototype.changeDecorationOrder = function (id, orderChange) {
    var index = -1;
    for (var i = 0; i < this.design.decorations.length; i++) {
      if (this.design.decorations[i].id === id) {
        index = i;
        break;
      }
    }
    if (index < 0) return false;
    var newIndex = Utils.clamp(index + orderChange, 0, this.design.decorations.length - 1);
    var decoration = this.design.decorations.splice(index, 1)[0];
    this.design.decorations.splice(newIndex, 0, decoration);
    return newIndex !== index;
  };

  /* ------------------------------------------------------------------ *
   * Deletion
   * ------------------------------------------------------------------ */
  /** Deletes a component and everything that depends on it. */
  CreatureBuilder.prototype.deleteComponent = function (type, id) {
    var self = this;

    if (type === 'joint') {
      // Delete all attached bones (and their muscles).
      var boneIds = [];
      this.forEachBoneOfJoint(id, function (bone) {
        boneIds.push(bone.id);
      });
      boneIds.forEach(function (boneId) {
        self.deleteComponent('bone', boneId);
      });
      this.removeById(this.design.joints, id);
      return true;
    }

    if (type === 'bone') {
      // Delete the connected muscles and decorations.
      this.design.muscles = this.design.muscles.filter(function (muscle) {
        return muscle.startBoneID !== id && muscle.endBoneID !== id;
      });
      this.design.decorations = this.design.decorations.filter(function (decoration) {
        return decoration.boneId !== id;
      });
      this.removeById(this.design.bones, id);
      return true;
    }

    if (type === 'muscle') {
      this.removeById(this.design.muscles, id);
      return true;
    }

    if (type === 'decoration') {
      this.removeById(this.design.decorations, id);
      return true;
    }

    return false;
  };

  CreatureBuilder.prototype.removeById = function (list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        list.splice(i, 1);
        return true;
      }
    }
    return false;
  };

  CreatureBuilder.prototype.deleteAll = function () {
    this.design = EVO.CreatureDesign.empty();
    this.idCounter = 1;
    this.currentBone = null;
    this.currentMuscle = null;
    this.currentDecoration = null;
  };

  /* ------------------------------------------------------------------ *
   * Queries used by the editor UI
   * ------------------------------------------------------------------ */
  CreatureBuilder.prototype.getBoneCenter = function (bone) {
    var start = this.findJoint(bone.startJointID);
    var end = this.findJoint(bone.endJointID);
    if (!start || !end) return { x: 0, y: 0 };
    return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  };

  /** Returns the component (type + id) that is closest to the given point. */
  CreatureBuilder.prototype.hitTest = function (point, tolerance) {
    tolerance = tolerance === undefined ? 0.6 : tolerance;

    // Joints first
    var best = null;
    var bestDistance = Infinity;
    for (var i = 0; i < this.design.joints.length; i++) {
      var joint = this.design.joints[i];
      var distance = Utils.distance(joint.x, joint.y, point.x, point.y);
      if (distance < EVO.Creature.JOINT_RADIUS + tolerance && distance < bestDistance) {
        bestDistance = distance;
        best = { type: 'joint', id: joint.id };
      }
    }
    if (best) return best;

    // Decorations
    for (var d = 0; d < this.design.decorations.length; d++) {
      var decoration = this.design.decorations[d];
      var bone = this.findBone(decoration.boneId);
      if (!bone) continue;
      var center = this.getBoneCenter(bone);
      var offset = decorationOffsetInWorld(decoration, bone, this);
      var dx = point.x - offset.x;
      var dy = point.y - offset.y;
      if (Math.sqrt(dx * dx + dy * dy) < 0.7) {
        return { type: 'decoration', id: decoration.id };
      }
    }

    // Muscles
    bestDistance = Infinity;
    for (var m = 0; m < this.design.muscles.length; m++) {
      var muscle = this.design.muscles[m];
      var startBone = this.findBone(muscle.startBoneID);
      var endBone = this.findBone(muscle.endBoneID);
      if (!startBone || !endBone) continue;
      var distance2 = Utils.distance(
        this.getBoneCenter(startBone).x,
        this.getBoneCenter(startBone).y,
        this.getBoneCenter(endBone).x,
        this.getBoneCenter(endBone).y
      );
      if (distance2 > 0.001) {
        var distance3 = distanceToSegment(
          point.x,
          point.y,
          this.getBoneCenter(startBone).x,
          this.getBoneCenter(startBone).y,
          this.getBoneCenter(endBone).x,
          this.getBoneCenter(endBone).y
        );
        if (distance3 < tolerance && distance3 < bestDistance) {
          bestDistance = distance3;
          best = { type: 'muscle', id: muscle.id };
        }
      }
    }
    if (best) return best;

    // Bones
    bestDistance = Infinity;
    for (var b = 0; b < this.design.bones.length; b++) {
      var bone2 = this.design.bones[b];
      var start = this.findJoint(bone2.startJointID);
      var end = this.findJoint(bone2.endJointID);
      if (!start || !end) continue;
      var distance4 = distanceToSegment(point.x, point.y, start.x, start.y, end.x, end.y);
      if (distance4 < CONNECTION_WIDTH / 2 + tolerance && distance4 < bestDistance) {
        bestDistance = distance4;
        best = { type: 'bone', id: bone2.id };
      }
    }

    return best;
  };

  /** Returns the closest bone under a point, ignoring joints and overlays. */
  CreatureBuilder.prototype.hitTestBone = function (point, tolerance) {
    tolerance = tolerance === undefined ? 0.6 : tolerance;
    var maximumDistance = CONNECTION_WIDTH / 2 + tolerance;
    var best = null;
    var bestDistance = Infinity;

    for (var i = 0; i < this.design.bones.length; i++) {
      var bone = this.design.bones[i];
      var start = this.findJoint(bone.startJointID);
      var end = this.findJoint(bone.endJointID);
      if (!start || !end) continue;

      var distance = distanceToSegment(point.x, point.y, start.x, start.y, end.x, end.y);
      // On an exact overlap, prefer the later bone: it is drawn above earlier
      // bones by Renderer.drawCreature and is therefore the visible target.
      if (distance < maximumDistance && distance <= bestDistance) {
        best = bone;
        bestDistance = distance;
      }
    }

    return best;
  };

  function decorationOffsetInWorld(decoration, bone, builder) {
    var start = builder.findJoint(bone.startJointID);
    var end = builder.findJoint(bone.endJointID);
    if (!start || !end) return { x: 0, y: 0 };
    var angle = Math.atan2(-(end.x - start.x), end.y - start.y);
    var centerX = (start.x + end.x) / 2;
    var centerY = (start.y + end.y) / 2;
    var total = angle + decoration.rotation * Utils.Deg2Rad;
    // Bone space: x along the bone, y perpendicular.
    var cos = Math.cos(total);
    var sin = Math.sin(total);
    return {
      x: centerX + decoration.offset.x * cos + decoration.offset.y * sin,
      y: centerY + decoration.offset.x * sin - decoration.offset.y * cos,
    };
  }

  function distanceToSegment(px, py, ax, ay, bx, by) {
    var dx = bx - ax;
    var dy = by - ay;
    var lengthSq = dx * dx + dy * dy;
    if (lengthSq < 1e-9) return Utils.distance(px, py, ax, ay);
    var t = Utils.clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1);
    return Utils.distance(px, py, ax + t * dx, ay + t * dy);
  }

  /* ------------------------------------------------------------------ *
   * Undo history (HistoryManager.cs)
   * ------------------------------------------------------------------ */
  function HistoryManager(maxEntries) {
    this.maxEntries = maxEntries || 40;
    this.entries = [];
    this.index = -1;
  }

  HistoryManager.prototype.push = function (design) {
    // Drop the redo entries and store a deep copy of the design so that later
    // modifications cannot change the history.
    this.entries = this.entries.slice(0, this.index + 1);
    this.entries.push(EVO.CreatureDesign.encode(EVO.CreatureDesign.clone(design)));
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
    this.index = this.entries.length - 1;
  };

  HistoryManager.prototype.canUndo = function () {
    return this.index > 0;
  };

  HistoryManager.prototype.canRedo = function () {
    return this.index < this.entries.length - 1;
  };

  HistoryManager.prototype.undo = function () {
    if (!this.canUndo()) return null;
    this.index--;
    return EVO.CreatureDesign.decode(this.entries[this.index]);
  };

  HistoryManager.prototype.redo = function () {
    if (!this.canRedo()) return null;
    this.index++;
    return EVO.CreatureDesign.decode(this.entries[this.index]);
  };

  HistoryManager.prototype.reset = function () {
    this.entries = [];
    this.index = -1;
  };

  EVO.CreatureBuilder = CreatureBuilder;
  EVO.HistoryManager = HistoryManager;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
