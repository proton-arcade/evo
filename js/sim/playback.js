/*
 * Evolution (Web Edition) — sim/playback.js
 * ---------------------------------------------------------------
 * Plays back a recorded creature (the best creature of a generation).
 * Port of Assets/Scripts/Controllers/GalleryPlaybackController.cs and
 * the playback part of CreatureRecording.cs.
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});

  function PlaybackCreature(recording) {
    this.recording = recording;
    var design = recording.creatureDesign;
    var movementData = recording.movementData;

    this.numberOfJoints = design.joints.length;
    this.player = new EVO.CreatureRecordingPlayer(
      movementData,
      this.numberOfJoints,
      design.muscles.length
    );

    this.jointIndexById = Object.create(null);
    var self = this;
    design.joints.forEach(function (joint, index) {
      self.jointIndexById[joint.id] = index;
    });

    this.joints = design.joints.map(function (joint) {
      return { x: joint.x, y: joint.y };
    });

    this.bones = design.bones.map(function (bone) {
      return {
        data: bone,
        startIndex: self.jointIndexById[bone.startJointID],
        endIndex: self.jointIndexById[bone.endJointID],
        start: { x: 0, y: 0 },
        end: { x: 0, y: 0 },
        center: { x: 0, y: 0 },
        angle: 0,
        inverted: !!bone.inverted,
        isWing: !!bone.isWing,
        wingChord: bone.wingChord === undefined ? 1 : bone.wingChord,
      };
    });

    this.boneById = Object.create(null);
    this.bones.forEach(function (bone) {
      self.boneById[bone.data.id] = bone;
    });

    this.muscles = design.muscles.map(function (muscle) {
      return {
        data: muscle,
        startBone: self.boneById[muscle.startBoneID],
        endBone: self.boneById[muscle.endBoneID],
        start: { x: 0, y: 0 },
        end: { x: 0, y: 0 },
        force: 0,
      };
    });

    this.decorations = design.decorations.map(function (decoration) {
      return {
        data: decoration,
        bone: self.boneById[decoration.boneId],
        offset: decoration.offset,
        scale: decoration.scale,
        rotation: decoration.rotation,
        flipX: decoration.flipX,
        flipY: decoration.flipY,
        decorationType: decoration.decorationType,
      };
    });

    this.duration = this.player.getDuration();
    this.seek(0);
  }

  PlaybackCreature.prototype.getDuration = function () {
    return this.duration;
  };

  PlaybackCreature.prototype.seek = function (time) {
    this.player.seekPlaybackToTime(time);

    var i;
    for (i = 0; i < this.numberOfJoints; i++) {
      var position = this.player.getRecordedJointPosition(i);
      this.joints[i].x = position.x;
      this.joints[i].y = position.y;
    }

    for (i = 0; i < this.bones.length; i++) {
      var bone = this.bones[i];
      var start = this.joints[bone.startIndex];
      var end = this.joints[bone.endIndex];
      if (!start || !end) continue;
      bone.start.x = start.x;
      bone.start.y = start.y;
      bone.end.x = end.x;
      bone.end.y = end.y;
      bone.center.x = (start.x + end.x) / 2;
      bone.center.y = (start.y + end.y) / 2;
      var dx = end.x - start.x;
      var dy = end.y - start.y;
      bone.angle = Math.atan2(-dx, dy);
      bone.length = Math.hypot(dx, dy);
    }

    for (i = 0; i < this.muscles.length; i++) {
      var muscle = this.muscles[i];
      muscle.start.x = muscle.startBone.center.x;
      muscle.start.y = muscle.startBone.center.y;
      muscle.end.x = muscle.endBone.center.x;
      muscle.end.y = muscle.endBone.center.y;
      muscle.force = this.player.getRecordedMuscleForce(i);
    }
  };

  /** Returns the bounds of the recorded movement (for camera framing). */
  PlaybackCreature.prototype.getBounds = function () {
    var minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    var data = this.recording.movementData.jointPositions;
    for (var j = 0; j < data.length; j++) {
      for (var s = 0; s < data[j].length; s++) {
        var p = data[j][s];
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
    }
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  };

  EVO.PlaybackCreature = PlaybackCreature;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
