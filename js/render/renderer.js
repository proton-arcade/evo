/*
 * Evolution (Web Edition) — render/renderer.js
 * ---------------------------------------------------------------
 * Canvas 2D renderer for the flatland world of Evolution.
 *
 * The original used Unity's sprite/mesh renderers with the following look
 * (see Assets/Resources/Materials):
 *   background       #EDEDED
 *   grid             #C7C7C7 (varies with the grid visibility setting)
 *   joints           red spheres (Joint Color)
 *   bones            dark grey rods
 *   muscles          dark red (contracting) / blue (expanding) lines
 *   ground           #636363 / #565656
 *   hidden creatures are drawn with an opacity of ~0.225
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});
  var Utils = EVO.Utils;

  /* ------------------------------------------------------------------ *
   * Camera — port of the editor camera / ZoomableCamera
   * ------------------------------------------------------------------ */
  function Camera(options) {
    options = options || {};
    this.x = 0;
    this.y = 0;
    this.orthographicSize = options.orthographicSize || 12.24;
    this.minZoom = options.minZoom === undefined ? 1.6 : options.minZoom;
    this.maxZoom = options.maxZoom === undefined ? 40 : options.maxZoom;
    this.width = 800;
    this.height = 600;
  }

  Camera.prototype.resize = function (width, height) {
    this.width = width;
    this.height = height;
  };

  Camera.prototype.pixelsPerUnit = function () {
    return this.height / (2 * this.orthographicSize);
  };

  Camera.prototype.worldToScreenX = function (x) {
    return (x - this.x) * this.pixelsPerUnit() + this.width / 2;
  };

  Camera.prototype.worldToScreenY = function (y) {
    // Screen space is flipped: +y in world space is up.
    return this.height / 2 - (y - this.y) * this.pixelsPerUnit();
  };

  Camera.prototype.screenToWorld = function (sx, sy) {
    var scale = this.pixelsPerUnit();
    return {
      x: (sx - this.width / 2) / scale + this.x,
      y: (this.height / 2 - sy) / scale + this.y,
    };
  };

  Camera.prototype.visibleBounds = function () {
    var halfHeight = this.orthographicSize;
    var halfWidth = (this.width / 2) / this.pixelsPerUnit();
    return {
      minX: this.x - halfWidth,
      maxX: this.x + halfWidth,
      minY: this.y - halfHeight,
      maxY: this.y + halfHeight,
      halfWidth: halfWidth,
      halfHeight: halfHeight,
    };
  };

  Camera.prototype.zoomAt = function (screenX, screenY, factor) {
    var before = this.screenToWorld(screenX, screenY);
    this.orthographicSize = Utils.clamp(
      this.orthographicSize * factor,
      this.minZoom,
      this.maxZoom
    );
    var after = this.screenToWorld(screenX, screenY);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
  };

  Camera.prototype.panByScreenDelta = function (dx, dy) {
    var scale = this.pixelsPerUnit();
    this.x -= dx / scale;
    this.y += dy / scale;
  };

  /* ------------------------------------------------------------------ *
   * Renderer
   * ------------------------------------------------------------------ */
  var COLORS = {
    background: '#ededed',
    grid: '#c9c9c9',
    joint: '#e10000',
    jointOutline: '#a80000',
    bone: '#2f2f2f',
    muscleContracting: '#8f2b2b',
    muscleExpanding: '#5f9ec4',
    muscleNeutral: '#d98c8c',
    structure: '#636363',
    steps: '#4f4f4f',
    obstacle: '#151515',
    marker: '#b3b3b3',
    selection: '#1b8ef2',
    selectionFill: 'rgba(27, 142, 242, 0.18)',
  };

  var Renderer = {
    COLORS: COLORS,

    drawBackground: function (ctx, camera) {
      ctx.fillStyle = COLORS.background;
      ctx.fillRect(0, 0, camera.width, camera.height);
    },

    /** The simulation background grid (Settings.DefaultGridVisibility). */
    drawGrid: function (ctx, camera, visibility, gridSize) {
      if (!visibility || visibility <= 0.001) return;
      gridSize = gridSize || 1;
      var bounds = camera.visibleBounds();
      var scale = camera.pixelsPerUnit();
      var step = gridSize * scale;
      while (step < 8) {
        step *= 2;
        gridSize *= 2;
      }

      ctx.save();
      ctx.globalAlpha = Utils.clamp(visibility, 0, 1) * 0.55;
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      var startX = Math.floor(bounds.minX / gridSize) * gridSize;
      for (var x = startX; x <= bounds.maxX; x += gridSize) {
        var sx = Math.round(camera.worldToScreenX(x)) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, camera.height);
      }
      var startY = Math.floor(bounds.minY / gridSize) * gridSize;
      for (var y = startY; y <= bounds.maxY; y += gridSize) {
        var sy = Math.round(camera.worldToScreenY(y)) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(camera.width, sy);
      }
      ctx.stroke();
      ctx.restore();
    },

    /** Draws the static structures of a scene. */
    drawScene: function (ctx, scene, camera) {
      var bounds = camera.visibleBounds();
      var renderables = scene ? scene.renderables : [];

      ctx.save();
      for (var i = 0; i < renderables.length; i++) {
        var entry = renderables[i];
        if (entry.kind === 'box') {
          this.drawBox(ctx, entry, camera, bounds);
        } else if (entry.kind === 'ground') {
          this.drawGround(ctx, entry, camera, bounds);
        } else if (entry.kind === 'circle') {
          this.drawCircle(ctx, entry, camera, bounds);
        }
      }
      ctx.restore();
    },

    drawBox: function (ctx, entry, camera, bounds) {
      if (
        entry.x + entry.halfWidth * 2 < bounds.minX ||
        entry.x - entry.halfWidth * 2 > bounds.maxX ||
        entry.y + entry.halfHeight * 2 < bounds.minY ||
        entry.y - entry.halfHeight * 2 > bounds.maxY
      ) {
        return;
      }
      var scale = camera.pixelsPerUnit();
      var cx = camera.worldToScreenX(entry.x);
      var cy = camera.worldToScreenY(entry.y);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-entry.angle);
      ctx.fillStyle = entry.color;
      var w = entry.halfWidth * 2 * scale;
      var h = entry.halfHeight * 2 * scale;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      if (entry.accent) {
        // A lighter strip along the top edge, so that the solid blocks of the
        // obstacle course read clearly against the ground and the background.
        ctx.fillStyle = entry.accent;
        ctx.fillRect(-w / 2, -h / 2, w, Math.max(2, Math.min(h * 0.14, 0.18 * scale)));
      }
      ctx.restore();
    },

    drawGround: function (ctx, entry, camera, bounds) {
      var cy = camera.worldToScreenY(entry.y);
      ctx.save();
      ctx.translate(camera.width / 2, cy);
      ctx.rotate(-entry.angle);
      ctx.fillStyle = entry.color;
      ctx.fillRect(-camera.width, -camera.height * 4, camera.width * 2, camera.height * 4);
      ctx.restore();
    },

    drawCircle: function (ctx, entry, camera, bounds) {
      var cx = camera.worldToScreenX(entry.x);
      var cy = camera.worldToScreenY(entry.y);
      var radius = entry.radius * camera.pixelsPerUnit();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(entry.spin || 0);
      ctx.fillStyle = entry.color;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      // A little highlight so that the rotation of the ball is visible.
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = '#6f6f6f';
      ctx.beginPath();
      ctx.arc(-radius * 0.3, -radius * 0.3, radius * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },

    /** The distance markers ("5", "10", ...) of the simulation scenes. */
    drawDistanceMarkers: function (ctx, scene, camera) {
      if (!scene || !scene.distanceMarkers || !scene.distanceMarkers.length) return;
      var bounds = camera.visibleBounds();
      ctx.save();
      ctx.fillStyle = COLORS.marker;
      ctx.font = '600 22px "Helvetica Neue", Helvetica, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var i = 0; i < scene.distanceMarkers.length; i++) {
        var marker = scene.distanceMarkers[i];
        if (marker.x < bounds.minX - 20 || marker.x > bounds.maxX + 20) continue;
        if (marker.y < bounds.minY - 20 || marker.y > bounds.maxY + 20) continue;
        ctx.save();
        ctx.translate(camera.worldToScreenX(marker.x), camera.worldToScreenY(marker.y));
        ctx.rotate(-marker.angle);
        ctx.fillText(marker.label, 0, 0);
        ctx.restore();
      }
      ctx.restore();
    },

    /* ---------------------------------------------------------------- *
     * Creatures
     * ---------------------------------------------------------------- */
    /**
     * Draws a creature (or any object exposing joints/bones/muscles arrays).
     * options: { opacity, showMuscles, showContraction, highlight }
     */
    drawCreature: function (ctx, creature, camera, options) {
      options = options || {};
      var opacity = options.opacity === undefined ? 1 : options.opacity;
      if (opacity <= 0.01) return;
      var scale = camera.pixelsPerUnit();

      ctx.save();
      ctx.globalAlpha = opacity;

      // 1. Decoration sprites (drawn behind the body, like the original's
      //    sorting order 20+).
      if (options.showDecorations !== false && creature.decorations) {
        for (var d = 0; d < creature.decorations.length; d++) {
          this.drawDecoration(ctx, creature.decorations[d], camera, opacity);
        }
      }

      // 2. Muscles
      if (options.showMuscles !== false && creature.muscles) {
        for (var m = 0; m < creature.muscles.length; m++) {
          var muscle = creature.muscles[m];
          var start = muscle.startBone;
          var end = muscle.endBone;
          var color = COLORS.muscleNeutral;
          if (options.showContraction) {
            if (muscle.muscleAction === EVO.Creature.MuscleAction.CONTRACT) {
              color = COLORS.muscleContracting;
            } else if (muscle.data.canExpand) {
              color = COLORS.muscleExpanding;
            }
          }
          var alpha = 0.9;
          if (options.showContraction) {
            var intensity = Utils.clamp(
              muscle.currentForce / Math.max(muscle.data.strength, 0.000001),
              0,
              1
            );
            alpha = 0.5 + 0.5 * intensity;
          }
          ctx.save();
          ctx.globalAlpha = opacity * alpha;
          ctx.strokeStyle = color;
          ctx.lineWidth = 0.28 * scale;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(camera.worldToScreenX(start.center.x), camera.worldToScreenY(start.center.y));
          ctx.lineTo(camera.worldToScreenX(end.center.x), camera.worldToScreenY(end.center.y));
          ctx.stroke();
          ctx.restore();
        }
      }

      // 3. Bones
      if (creature.bones) {
        for (var b = 0; b < creature.bones.length; b++) {
          this.drawBone(ctx, creature.bones[b], camera, opacity, options.selectedBones);
        }
      }

      // 4. Joints
      if (creature.joints) {
        for (var j = 0; j < creature.joints.length; j++) {
          this.drawJoint(ctx, creature.joints[j], camera, opacity, options.selectedJoints);
        }
      }

      ctx.restore();
    },

    drawBone: function (ctx, bone, camera, opacity, selectedBones) {
      var start = bone.startJoint
        ? { x: bone.startJoint.body.x, y: bone.startJoint.body.y }
        : bone.start;
      var end = bone.endJoint ? { x: bone.endJoint.body.x, y: bone.endJoint.body.y } : bone.end;
      if (!start || !end) return;

      var scale = camera.pixelsPerUnit();
      var ax = camera.worldToScreenX(start.x);
      var ay = camera.worldToScreenY(start.y);
      var bx = camera.worldToScreenX(end.x);
      var by = camera.worldToScreenY(end.y);

      var selected = selectedBones && selectedBones[bone.data.id];
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.lineCap = 'round';
      ctx.strokeStyle = selected ? COLORS.selection : COLORS.bone;
      ctx.lineWidth = EVO.Creature.CONNECTION_WIDTH * scale;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      ctx.restore();
    },

    drawJoint: function (ctx, joint, camera, opacity, selectedJoints) {
      var body = joint.body || joint;
      var scale = camera.pixelsPerUnit();
      var x = camera.worldToScreenX(body.x);
      var y = camera.worldToScreenY(body.y);
      var radius = Math.max(3, EVO.Creature.JOINT_RADIUS * scale);
      var selected = selectedJoints && selectedJoints[joint.data ? joint.data.id : -1];

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.joint;
      ctx.fill();
      if (selected) {
        ctx.lineWidth = Math.max(2, radius * 0.35);
        ctx.strokeStyle = COLORS.selection;
        ctx.stroke();
      } else {
        ctx.lineWidth = Math.max(1, radius * 0.14);
        ctx.strokeStyle = COLORS.jointOutline;
        ctx.stroke();
      }
      ctx.restore();
    },

    /* ---------------------------------------------------------------- *
     * Decorations (v4 cosmetics)
     * ---------------------------------------------------------------- */
    drawDecoration: function (ctx, decoration, camera, opacity) {
      var bone = decoration.bone;
      if (!bone) return;
      var center = bone.center;
      var angle = bone.angle;
      var scale = camera.pixelsPerUnit();
      var px = camera.worldToScreenX(center.x);
      var py = camera.worldToScreenY(center.y);

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.translate(px, py);
      // Bone space: x along the bone, y perpendicular.
      ctx.rotate(-(angle + decoration.rotation * Utils.Deg2Rad));
      var s = scale * decoration.scale;
      ctx.scale(decoration.flipX ? -1 : 1, decoration.flipY ? -1 : 1);
      ctx.translate(decoration.offset.x * scale, -decoration.offset.y * scale);
      EVO.DecorationShapes.draw(ctx, decoration.decorationType, s);
      ctx.restore();
    },

    /* ---------------------------------------------------------------- *
     * Recording playback
     * ---------------------------------------------------------------- */
    drawPlaybackCreature: function (ctx, playback, camera, options) {
      options = options || {};
      var opacity = options.opacity === undefined ? 1 : options.opacity;
      var scale = camera.pixelsPerUnit();
      ctx.save();
      ctx.globalAlpha = opacity;

      // Match the live creature's draw order so custom cosmetics remain visible
      // in both simulation playback and the gallery.
      if (playback.decorations) {
        for (var d = 0; d < playback.decorations.length; d++) {
          this.drawDecoration(ctx, playback.decorations[d], camera, opacity);
        }
      }

      // Muscles
      if (playback.muscles && options.showMuscles !== false) {
        for (var m = 0; m < playback.muscles.length; m++) {
          var muscle = playback.muscles[m];
          var color = COLORS.muscleNeutral;
          if (options.showContraction) {
            color =
              muscle.force >= 0 ? COLORS.muscleContracting : COLORS.muscleExpanding;
          }
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = 0.28 * scale;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(
            camera.worldToScreenX(muscle.start.x),
            camera.worldToScreenY(muscle.start.y)
          );
          ctx.lineTo(camera.worldToScreenX(muscle.end.x), camera.worldToScreenY(muscle.end.y));
          ctx.stroke();
          ctx.restore();
        }
      }

      // Bones
      ctx.strokeStyle = COLORS.bone;
      ctx.lineWidth = EVO.Creature.CONNECTION_WIDTH * scale;
      ctx.lineCap = 'round';
      for (var b = 0; b < playback.bones.length; b++) {
        var bone = playback.bones[b];
        ctx.beginPath();
        ctx.moveTo(camera.worldToScreenX(bone.start.x), camera.worldToScreenY(bone.start.y));
        ctx.lineTo(camera.worldToScreenX(bone.end.x), camera.worldToScreenY(bone.end.y));
        ctx.stroke();
      }

      // Joints
      var radius = Math.max(3, EVO.Creature.JOINT_RADIUS * scale);
      ctx.fillStyle = COLORS.joint;
      for (var j = 0; j < playback.joints.length; j++) {
        ctx.beginPath();
        ctx.arc(
          camera.worldToScreenX(playback.joints[j].x),
          camera.worldToScreenY(playback.joints[j].y),
          radius,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      ctx.restore();
    },
  };

  EVO.Camera = Camera;
  EVO.Renderer = Renderer;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
