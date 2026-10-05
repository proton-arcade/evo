/*
 * Evolution (Web Edition) — render/viewModel.js
 * ---------------------------------------------------------------
 * Turns a creature *design* into something `Renderer.drawCreature` can
 * paint, without needing a simulation or an editor behind it.
 *
 * `buildRenderModel` and `frameDesign` used to live on the editor screen; they
 * are shared now so the Custom Creatures screen can draw posters of designs
 * that were never opened in the editor. The editor delegates to them.
 *
 * Pure geometry plus `drawPoster`, which only touches the canvas it is given.
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});
  var Utils = EVO.Utils;
  var Renderer = EVO.Renderer;

  /** Joint / bone / muscle / decoration entries wired together by id. */
  function buildRenderModel(design) {
    var jointById = Object.create(null);
    var joints = design.joints.map(function (data) {
      var joint = {
        data: data,
        body: { x: data.x, y: data.y },
      };
      jointById[data.id] = joint;
      return joint;
    });

    var boneById = Object.create(null);
    var bones = design.bones.map(function (data) {
      var bone = {
        data: data,
        startJoint: jointById[data.startJointID],
        endJoint: jointById[data.endJointID],
        center: { x: 0, y: 0 },
        angle: 0,
      };
      if (bone.startJoint && bone.endJoint) {
        bone.center.x = (bone.startJoint.body.x + bone.endJoint.body.x) / 2;
        bone.center.y = (bone.startJoint.body.y + bone.endJoint.body.y) / 2;
        bone.angle = Math.atan2(
          -(bone.endJoint.body.x - bone.startJoint.body.x),
          bone.endJoint.body.y - bone.startJoint.body.y
        );
      }
      boneById[data.id] = bone;
      return bone;
    });

    var muscles = design.muscles.map(function (data) {
      return {
        data: data,
        startBone: boneById[data.startBoneID],
        endBone: boneById[data.endBoneID],
        muscleAction: EVO.Creature.MuscleAction.CONTRACT,
        currentForce: 0,
      };
    });

    var decorations = design.decorations.map(function (data) {
      return {
        data: data,
        bone: boneById[data.boneId],
        offset: data.offset,
        scale: data.scale,
        rotation: data.rotation,
        flipX: data.flipX,
        flipY: data.flipY,
        decorationType: data.decorationType,
      };
    });

    return { joints: joints, bones: bones, muscles: muscles, decorations: decorations };
  }

  /**
   * Like `buildRenderModel`, but tolerates a design whose bones, muscles or
   * decorations point at parts that do not exist: those entries are left out
   * instead of crashing the renderer (a muscle with a missing bone would throw).
   */
  function buildSafeRenderModel(design) {
    var model = buildRenderModel(design);
    model.bones = model.bones.filter(function (bone) {
      return bone.startJoint && bone.endJoint;
    });
    var liveBones = Object.create(null);
    model.bones.forEach(function (bone) {
      liveBones[bone.data.id] = true;
    });
    model.muscles = model.muscles.filter(function (muscle) {
      return muscle.startBone && muscle.endBone && liveBones[muscle.startBone.data.id] && liveBones[muscle.endBone.data.id];
    });
    model.decorations = model.decorations.filter(function (decoration) {
      return decoration.bone && liveBones[decoration.bone.data.id];
    });
    return model;
  }

  /** Joint bounds of a design, or null when it has no joints. */
  function designBounds(design) {
    if (!design.joints.length) return null;
    var minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    design.joints.forEach(function (joint) {
      minX = Math.min(minX, joint.x);
      maxX = Math.max(maxX, joint.x);
      minY = Math.min(minY, joint.y);
      maxY = Math.max(maxY, joint.y);
    });
    return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
  }

  /** The editor's framing: centre on the design and zoom to roughly fit it. */
  function frameDesign(design, camera) {
    var bounds = designBounds(design);
    if (!bounds) {
      camera.x = 0;
      camera.y = 3;
      camera.orthographicSize = 10;
      return;
    }
    var width = Math.max(6, bounds.maxX - bounds.minX);
    var height = Math.max(6, bounds.maxY - bounds.minY);
    camera.x = (bounds.minX + bounds.maxX) / 2;
    camera.y = (bounds.minY + bounds.maxY) / 2;
    camera.orthographicSize = Utils.clamp(Math.max(width * 0.75, height * 0.9), 3, 40);
  }

  /**
   * Aspect-aware framing for posters and the hero: fits the design into
   * `region` — fractions `{ left, top, right, bottom }` of the canvas — and
   * centres it there. The default region is the whole canvas with a margin.
   */
  function fitCamera(design, camera, region) {
    region = region || { left: 0.1, top: 0.1, right: 0.9, bottom: 0.9 };
    var bounds = designBounds(design) || { minX: -3, maxX: 3, minY: 0, maxY: 6 };
    var width = Math.max(6, bounds.maxX - bounds.minX);
    var height = Math.max(6, bounds.maxY - bounds.minY);
    var regionWidth = (region.right - region.left) * camera.width;
    var regionHeight = (region.bottom - region.top) * camera.height;
    var pixelsPerUnit = Math.min(regionWidth / width, regionHeight / height);
    if (!(pixelsPerUnit > 0)) pixelsPerUnit = 1;
    camera.orthographicSize = camera.height / (2 * pixelsPerUnit);
    var regionCenterX = ((region.left + region.right) / 2) * camera.width;
    var regionCenterY = ((region.top + region.bottom) / 2) * camera.height;
    camera.x = (bounds.minX + bounds.maxX) / 2 - (regionCenterX - camera.width / 2) / pixelsPerUnit;
    camera.y = (bounds.minY + bounds.maxY) / 2 + (regionCenterY - camera.height / 2) / pixelsPerUnit;
  }

  /**
   * Paints a design onto a canvas as cover art using the editor's own light
   * background and creature palette. The backing store is sized for the
   * device pixel ratio, so call this again after the canvas changes size.
   * Returns false when the canvas has no layout size yet or no 2D context.
   *
   * options.width / options.height  CSS pixel size (default: the element's)
   * options.region                  fitCamera region
   * options.grid                    true, or a numeric grid visibility
   * options.gridSize                world-unit grid spacing (default: setting)
   */
  function drawPoster(canvas, design, options) {
    options = options || {};
    var width = options.width || canvas.clientWidth;
    var height = options.height || canvas.clientHeight;
    if (!width || !height) return false;
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return false;

    var ratio = Utils.displayPixelRatio ? Utils.displayPixelRatio() : Math.min(global.devicePixelRatio || 1, 2);
    var pixelWidth = Math.floor(width * ratio);
    var pixelHeight = Math.floor(height * ratio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

    var camera = new EVO.Camera();
    camera.resize(width, height);
    fitCamera(design, camera, options.region);

    ctx.save();
    try {
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      Renderer.drawBackground(ctx, camera);
      if (options.grid) {
        var visibility = typeof options.grid === 'number' ? options.grid : 0.45;
        var gridSize =
          options.gridSize || (EVO.Settings && EVO.Settings.GridSize) || 1;
        Renderer.drawGrid(ctx, camera, visibility, gridSize);
      }
      Renderer.drawCreature(ctx, buildSafeRenderModel(design), camera, {
        opacity: 1,
        showMuscles: true,
        showContraction: false,
      });
    } finally {
      ctx.restore();
    }
    return true;
  }

  EVO.ViewModel = {
    buildRenderModel: buildRenderModel,
    buildSafeRenderModel: buildSafeRenderModel,
    designBounds: designBounds,
    frameDesign: frameDesign,
    fitCamera: fitCamera,
    drawPoster: drawPoster,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
