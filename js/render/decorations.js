/*
 * Evolution (Web Edition) — render/decorations.js
 * ---------------------------------------------------------------
 * Vector drawings for the cosmetic body decorations of v4.
 * Each shape is drawn inside a coordinate system whose unit is one world
 * unit, centred on the decoration, with +x pointing along the bone and
 * +y perpendicular to it.
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});
  var T = EVO.DecorationType;

  var WHITE = '#f7f7f7';
  var BLACK = '#1b1b1b';
  var SKIN = '#e0b18c';
  var DARK = '#2b2b2b';
  var RED = '#c0392b';

  function ellipse(ctx, x, y, rx, ry, fill, stroke, lineWidth) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth || 0.08;
      ctx.stroke();
    }
  }

  function circle(ctx, x, y, r, fill) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function path(ctx, points, closed, fill, stroke, lineWidth) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    if (closed) ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth || 0.08;
      ctx.stroke();
    }
  }

  function arc(ctx, x, y, r, from, to, stroke, lineWidth) {
    ctx.beginPath();
    ctx.arc(x, y, r, from, to);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth || 0.12;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  /* --- Individual shapes --------------------------------------------- */

  function eyeWhite(ctx) {
    ellipse(ctx, 0, 0, 0.45, 0.5, WHITE, BLACK, 0.06);
  }

  var shapes = {};

  shapes[T.EmptyEyeOval] = function (ctx) {
    eyeWhite(ctx);
  };
  shapes[T.EmptyEyeCircle] = function (ctx) {
    ellipse(ctx, 0, 0, 0.42, 0.42, WHITE, BLACK, 0.06);
  };
  shapes[T.EmptyEyeRounded] = function (ctx) {
    ellipse(ctx, 0, 0, 0.5, 0.35, WHITE, BLACK, 0.06);
  };
  shapes[T.EmptyEyeSlanted] = function (ctx) {
    ctx.save();
    ctx.rotate(-0.2);
    ellipse(ctx, 0, 0, 0.5, 0.32, WHITE, BLACK, 0.06);
    ctx.restore();
  };
  shapes[T.EmptyEyeHappy] = function (ctx) {
    arc(ctx, 0, 0.05, 0.45, Math.PI * 1.1, Math.PI * 1.9, BLACK, 0.12);
  };

  shapes[T.PupilDot] = function (ctx) {
    circle(ctx, 0, 0, 0.2, BLACK);
  };
  shapes[T.PupilTriangleCut] = function (ctx) {
    path(ctx, [[-0.2, 0.2], [0.2, 0.2], [0, -0.22]], true, BLACK);
  };
  shapes[T.PupilReflection] = function (ctx) {
    circle(ctx, 0, 0, 0.18, BLACK);
    circle(ctx, -0.07, -0.07, 0.05, WHITE);
    circle(ctx, 0.06, 0.07, 0.03, WHITE);
  };

  function googlyEye(ctx) {
    eyeWhite(ctx);
    circle(ctx, 0.06, -0.05, 0.19, BLACK);
  }

  shapes[T.GooglyEye] = googlyEye;
  shapes[T.ShiftyEyes] = function (ctx) {
    eyeWhite(ctx);
    circle(ctx, 0.14, -0.02, 0.17, BLACK);
  };

  function eyebrow(ctx, tilt) {
    ctx.save();
    ctx.rotate(tilt);
    path(ctx, [[-0.4, 0], [0.4, 0.05]], false, null, DARK, 0.12);
    ctx.restore();
  }
  shapes[T.EyebrowNormal] = function (ctx) {
    eyebrow(ctx, 0);
  };
  shapes[T.EyebrowRaised] = function (ctx) {
    eyebrow(ctx, -0.25);
  };
  shapes[T.EyebrowAngry] = function (ctx) {
    eyebrow(ctx, 0.35);
  };

  shapes[T.MouthSmile] = function (ctx) {
    arc(ctx, 0, 0, 0.4, Math.PI * 0.15, Math.PI * 0.85, DARK, 0.12);
  };
  shapes[T.MouthLaugh] = function (ctx) {
    path(
      ctx,
      [
        [-0.4, 0],
        [-0.2, 0.3],
        [0.2, 0.3],
        [0.4, 0],
      ],
      true,
      DARK
    );
  };
  shapes[T.MouthLipSmile] = function (ctx) {
    arc(ctx, 0, 0, 0.4, Math.PI * 0.1, Math.PI * 0.9, RED, 0.14);
  };
  shapes[T.MouthWorried] = function (ctx) {
    arc(ctx, 0, 0.2, 0.35, Math.PI * 1.15, Math.PI * 1.85, DARK, 0.12);
  };
  shapes[T.MouthLips] = function (ctx) {
    ellipse(ctx, 0, 0, 0.28, 0.16, RED);
  };
  shapes[T.MouthLipsSmall] = function (ctx) {
    ellipse(ctx, 0, 0, 0.16, 0.1, RED);
  };
  shapes[T.MouthTongue] = function (ctx) {
    arc(ctx, 0, 0, 0.38, Math.PI * 0.15, Math.PI * 0.85, DARK, 0.1);
    ellipse(ctx, 0, 0.22, 0.18, 0.14, '#e06a6a');
  };

  function nose(ctx, size, tilt) {
    ctx.save();
    ctx.rotate(tilt);
    path(
      ctx,
      [
        [-size * 0.4, 0],
        [size * 0.4, 0],
        [0, size * 0.7],
      ],
      true,
      SKIN,
      DARK,
      0.05
    );
    ctx.restore();
  }
  shapes[T.NoseBigFront] = function (ctx) {
    nose(ctx, 0.9, 0);
  };
  shapes[T.NoseRaised] = function (ctx) {
    nose(ctx, 0.7, -0.3);
  };
  shapes[T.NoseSmall] = function (ctx) {
    nose(ctx, 0.45, 0);
  };
  shapes[T.NoseCrooked] = function (ctx) {
    nose(ctx, 0.6, 0.4);
  };
  shapes[T.NoseDroopy] = function (ctx) {
    nose(ctx, 0.65, 0.7);
  };

  function moustache(ctx, style) {
    ctx.fillStyle = DARK;
    ctx.beginPath();
    if (style === 0) {
      ctx.ellipse(-0.3, 0, 0.32, 0.14, 0.2, 0, Math.PI * 2);
      ctx.ellipse(0.3, 0, 0.32, 0.14, -0.2, 0, Math.PI * 2);
    } else if (style === 1) {
      ctx.ellipse(0, 0, 0.45, 0.18, 0, 0, Math.PI * 2);
    } else {
      ctx.moveTo(-0.45, 0.1);
      ctx.quadraticCurveTo(0, -0.25, 0.45, 0.1);
      ctx.quadraticCurveTo(0, 0.05, -0.45, 0.1);
    }
    ctx.fill();
  }
  shapes[T.Moustache1] = function (ctx) {
    moustache(ctx, 0);
  };
  shapes[T.Moustache2] = function (ctx) {
    moustache(ctx, 1);
  };
  shapes[T.Moustache3] = function (ctx) {
    moustache(ctx, 2);
  };

  shapes[T.EarSide] = function (ctx) {
    ctx.save();
    ctx.rotate(-0.4);
    ellipse(ctx, 0, 0.2, 0.22, 0.4, SKIN, DARK, 0.05);
    ctx.restore();
  };
  shapes[T.EarFront] = function (ctx) {
    ellipse(ctx, 0, 0, 0.32, 0.32, SKIN, DARK, 0.05);
  };

  function fingers(ctx, spread) {
    for (var i = -2; i <= 2; i++) {
      ctx.save();
      ctx.rotate((i * spread * Math.PI) / 180);
      ellipse(ctx, 0, 0.3, 0.09, 0.22, SKIN, DARK, 0.04);
      ctx.restore();
    }
  }
  shapes[T.HandOpenPalm] = function (ctx) {
    ellipse(ctx, 0, 0.05, 0.28, 0.25, SKIN, DARK, 0.05);
    fingers(ctx, 22);
  };
  shapes[T.HandBack] = function (ctx) {
    ellipse(ctx, 0, 0.05, 0.28, 0.24, SKIN, DARK, 0.05);
    fingers(ctx, 18);
  };
  shapes[T.Fist] = function (ctx) {
    ellipse(ctx, 0, 0.05, 0.3, 0.28, SKIN, DARK, 0.05);
    arc(ctx, 0, 0.1, 0.2, Math.PI * 0.1, Math.PI * 0.9, DARK, 0.05);
  };

  shapes[T.Foot] = function (ctx) {
    ellipse(ctx, 0.05, 0, 0.42, 0.2, SKIN, DARK, 0.05);
    circle(ctx, -0.28, 0.08, 0.07, SKIN);
    circle(ctx, -0.3, -0.02, 0.07, SKIN);
    circle(ctx, -0.28, -0.12, 0.07, SKIN);
  };
  shapes[T.Shoe] = function (ctx) {
    path(
      ctx,
      [
        [-0.35, -0.18],
        [0.4, -0.12],
        [0.48, 0.06],
        [-0.35, 0.18],
      ],
      true,
      DARK
    );
  };
  shapes[T.ShoeHighHeel] = function (ctx) {
    path(
      ctx,
      [
        [-0.35, -0.18],
        [0.4, -0.1],
        [0.5, 0.1],
        [-0.3, 0.16],
        [-0.35, 0.3],
      ],
      true,
      DARK
    );
  };
  shapes[T.ShoeCartoon] = function (ctx) {
    ellipse(ctx, 0.1, 0, 0.45, 0.24, DARK);
    ellipse(ctx, 0.1, -0.05, 0.35, 0.1, '#4a4a4a');
  };

  shapes[T.Brain] = function (ctx) {
    ellipse(ctx, 0, 0, 0.42, 0.36, '#e7a1b0', DARK, 0.05);
    arc(ctx, 0, 0.05, 0.22, 0, Math.PI * 2, '#b9758a', 0.05);
    arc(ctx, 0, 0, 0.3, Math.PI * 0.2, Math.PI * 1.2, '#b9758a', 0.04);
  };
  shapes[T.Bone] = function (ctx) {
    ctx.fillStyle = WHITE;
    ctx.fillRect(-0.35, -0.09, 0.7, 0.18);
    circle(ctx, -0.35, -0.08, 0.12, WHITE);
    circle(ctx, -0.35, 0.08, 0.12, WHITE);
    circle(ctx, 0.35, -0.08, 0.12, WHITE);
    circle(ctx, 0.35, 0.08, 0.12, WHITE);
  };

  shapes[T.CatEar] = function (ctx) {
    path(
      ctx,
      [
        [-0.28, -0.2],
        [0, 0.42],
        [0.28, -0.2],
      ],
      true,
      SKIN,
      DARK,
      0.05
    );
    path(
      ctx,
      [
        [-0.15, -0.15],
        [0, 0.2],
        [0.15, -0.15],
      ],
      true,
      '#d78f8f'
    );
  };
  shapes[T.CatWhiskers] = function (ctx) {
    for (var i = -1; i <= 1; i++) {
      path(
        ctx,
        [
          [0.1, i * 0.12],
          [0.6, i * 0.28],
        ],
        false,
        null,
        DARK,
        0.035
      );
      path(
        ctx,
        [
          [-0.1, i * 0.12],
          [-0.6, i * 0.28],
        ],
        false,
        null,
        DARK,
        0.035
      );
    }
  };
  shapes[T.CatSnout] = function (ctx) {
    ellipse(ctx, 0, 0, 0.24, 0.18, '#e8c4b0', DARK, 0.04);
    path(
      ctx,
      [
        [-0.06, 0.02],
        [0.06, 0.02],
        [0, -0.06],
      ],
      true,
      '#c4707c'
    );
  };

  var DecorationShapes = {
    /** Draws the decoration shape with a size of roughly 1 world unit. */
    draw: function (ctx, type, scale) {
      var shape = shapes[type];
      ctx.save();
      ctx.scale(scale, scale);
      if (shape) {
        shape(ctx);
      } else {
        circle(ctx, 0, 0, 0.3, DARK);
      }
      ctx.restore();
    },
    has: function (type) {
      return !!shapes[type];
    },
  };

  EVO.DecorationShapes = DecorationShapes;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
