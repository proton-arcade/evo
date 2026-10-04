/*
 * Evolution (Web Edition) — sim/physics.js
 * ---------------------------------------------------------------
 * A rigid body physics engine written for the 2D flatland world of
 * Evolution.  The original game used Unity's internal 3D physics engine
 * with everything constrained to the XY-plane (rigid bodies with Z-locked
 * constraints, hinge joints around the z-axis and spring joints as muscles).
 *
 * The web edition simulates the exact same model:
 *
 *   • "Joints" are spheres (here: circles) with a mass and a frictionless
 *     surface that collide with the static scene geometry.
 *   • "Bones" are rigid rods that keep the distance between their two
 *     joints constant (hinge joints in the original).
 *   • "Muscles" are springs between two bone centres (Unity's SpringJoint)
 *     plus an active force that contracts or expands the muscle.
 *
 * The solver is a position based (PBD) solver using substeps, which is very
 * stable for the stiff springs and rigid links that the creatures consist of.
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});
  var Utils = EVO.Utils;

  /* ------------------------------------------------------------------ *
   * Body — a point mass with a radius (a "Joint" in the game)
   * ------------------------------------------------------------------ */
  function PhysicsBody(options) {
    this.x = options.x || 0;
    this.y = options.y || 0;
    this.vx = 0;
    this.vy = 0;
    this._prevX = this.x;
    this._prevY = this.y;

    this.mass = options.mass === undefined ? 1 : options.mass;
    this.invMass = this.mass > 0 ? 1 / this.mass : 0;
    this.radius = options.radius === undefined ? 0.5 : options.radius;
    this.collides = options.collides !== false;
    this.friction = options.friction === undefined ? 1.0 : options.friction;
    this.fixed = false;

    // External force applied in the current substep.
    this.fx = 0;
    this.fy = 0;

    // Contact state for the brain inputs and the objective trackers.
    this.touchingGround = false;
    this.touchingObstacle = false;
    this.contactNormalX = 0;
    this.contactNormalY = 0;
    this.normalCorrection = 0;

    // Arbitrary payload of the owning creature.
    this.owner = null;
    this.index = 0;
  }

  PhysicsBody.prototype.addForce = function (fx, fy) {
    this.fx += fx;
    this.fy += fy;
  };

  /**
   * Applies a force at the given world position.  The body is a point mass,
   * so the offset only matters for the lever arm in 3D — in the 2D
   * simulation a rigid rod distributes the force equally onto both
   * endpoints, which is what `Creature` does explicitly.
   */
  PhysicsBody.prototype.addForceAtPosition = function (fx, fy, px, py) {
    this.addForce(fx, fy);
  };

  /* ------------------------------------------------------------------ *
   * Distance constraint (a "Bone")
   * ------------------------------------------------------------------ */
  function DistanceConstraint(a, b, restLength, stiffness) {
    this.a = a;
    this.b = b;
    this.restLength = restLength;
    this.stiffness = stiffness === undefined ? 1 : stiffness;
    this.enabled = true;
  }

  /* ------------------------------------------------------------------ *
   * Static geometry
   * ------------------------------------------------------------------ */
  function StaticBox(cx, cy, halfWidth, halfHeight, angle, options) {
    options = options || {};
    this.cx = cx;
    this.cy = cy;
    this.hx = halfWidth;
    this.hy = halfHeight;
    this.angle = angle || 0;
    this.cos = Math.cos(-this.angle);
    this.sin = Math.sin(-this.angle);
    this.tag = options.tag || 'Scenery';
    this.friction = options.friction === undefined ? 1.0 : options.friction;
    this.layer = options.layer || 'StaticForeground';
    var extent = Math.sqrt(this.hx * this.hx + this.hy * this.hy);
    this.boundingRadius = extent;
  }

  StaticBox.prototype.toLocal = function (px, py) {
    var dx = px - this.cx;
    var dy = py - this.cy;
    return {
      x: dx * this.cos - dy * this.sin,
      y: dx * this.sin + dy * this.cos,
    };
  };

  StaticBox.prototype.toWorldDirection = function (lx, ly) {
    // inverse of the rotation used in toLocal
    var c = Math.cos(this.angle);
    var s = Math.sin(this.angle);
    return { x: lx * c - ly * s, y: lx * s + ly * c };
  };

  /** Rotates a direction into the local frame (no translation). */
  StaticBox.prototype.toLocalDirection = function (dx, dy) {
    return {
      x: dx * this.cos - dy * this.sin,
      y: dx * this.sin + dy * this.cos,
    };
  };

  function StaticCircle(x, y, radius, options) {
    options = options || {};
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.tag = options.tag || 'Obstacle';
    this.friction = options.friction === undefined ? 1.0 : options.friction;
    this.layer = options.layer || 'DynamicForeground';
  }

  /* ------------------------------------------------------------------ *
   * PhysicsWorld
   * ------------------------------------------------------------------ */
  function PhysicsWorld() {
    this.gravity = -9.81;
    this.bodies = [];
    this.constraints = [];
    this.staticBoxes = [];
    this.staticCircles = [];
    this.forceCallbacks = [];
    this.time = 0;
    // Velocity damping (loss) per second; a very small value keeps the
    // simulation from gaining energy.
    this.linearDamping = 0.0;

    // Uniform grid broad phase for the static geometry.
    this.gridCellSize = 12;
    this.grid = new Map();
    this.hugeBoxes = [];
    this.hugeCircles = [];
    this.gridDirty = true;
    this._queryResult = [];
  }

  PhysicsWorld.prototype.addBody = function (options) {
    var body = new PhysicsBody(options);
    body.index = this.bodies.length;
    this.bodies.push(body);
    return body;
  };

  PhysicsWorld.prototype.removeBody = function (body) {
    var index = this.bodies.indexOf(body);
    if (index >= 0) this.bodies.splice(index, 1);
  };

  PhysicsWorld.prototype.addConstraint = function (a, b, restLength, stiffness) {
    var constraint = new DistanceConstraint(a, b, restLength, stiffness);
    this.constraints.push(constraint);
    return constraint;
  };

  PhysicsWorld.prototype.addBox = function (cx, cy, halfWidth, halfHeight, angle, options) {
    var box = new StaticBox(cx, cy, halfWidth, halfHeight, angle, options);
    this.staticBoxes.push(box);
    this.gridDirty = true;
    return box;
  };

  PhysicsWorld.prototype.addCircle = function (x, y, radius, options) {
    var circle = new StaticCircle(x, y, radius, options);
    this.staticCircles.push(circle);
    this.gridDirty = true;
    return circle;
  };

  PhysicsWorld.prototype.removeCircle = function (circle) {
    var index = this.staticCircles.indexOf(circle);
    if (index >= 0) {
      this.staticCircles.splice(index, 1);
      this.gridDirty = true;
    }
  };

  PhysicsWorld.prototype._gridKey = function (cx, cy) {
    return cx + ':' + cy;
  };

  /** Builds (or rebuilds) the uniform grid used for the static broad phase. */
  PhysicsWorld.prototype.rebuildGrid = function () {
    this.grid = new Map();
    this.hugeBoxes = [];
    this.hugeCircles = [];

    var cell = this.gridCellSize;
    for (var i = 0; i < this.staticBoxes.length; i++) {
      var box = this.staticBoxes[i];
      if (box.boundingRadius > 40) {
        this.hugeBoxes.push(box);
        continue;
      }
      var minX = Math.floor((box.cx - box.boundingRadius) / cell);
      var maxX = Math.floor((box.cx + box.boundingRadius) / cell);
      var minY = Math.floor((box.cy - box.boundingRadius) / cell);
      var maxY = Math.floor((box.cy + box.boundingRadius) / cell);
      for (var gx = minX; gx <= maxX; gx++) {
        for (var gy = minY; gy <= maxY; gy++) {
          var key = this._gridKey(gx, gy);
          var list = this.grid.get(key);
          if (!list) {
            list = [];
            this.grid.set(key, list);
          }
          list.push(box);
        }
      }
    }

    for (var c = 0; c < this.staticCircles.length; c++) {
      var circle = this.staticCircles[c];
      if (circle.radius > 40) {
        this.hugeCircles.push(circle);
        continue;
      }
      var key2 = this._gridKey(Math.floor(circle.x / cell), Math.floor(circle.y / cell));
      var list2 = this.grid.get(key2);
      if (!list2) {
        list2 = [];
        this.grid.set(key2, list2);
      }
      list2.push(circle);
    }

    this.gridDirty = false;
  };

  /**
   * Returns a reusable array with all static shapes that could touch a circle
   * at (x, y) with the given radius.
   */
  PhysicsWorld.prototype.queryStatic = function (x, y, radius) {
    if (this.gridDirty) this.rebuildGrid();
    var result = this._queryResult;
    result.length = 0;

    var cell = this.gridCellSize;
    var minX = Math.floor((x - radius) / cell);
    var maxX = Math.floor((x + radius) / cell);
    var minY = Math.floor((y - radius) / cell);
    var maxY = Math.floor((y + radius) / cell);

    for (var gx = minX; gx <= maxX; gx++) {
      for (var gy = minY; gy <= maxY; gy++) {
        var list = this.grid.get(this._gridKey(gx, gy));
        if (!list) continue;
        for (var i = 0; i < list.length; i++) {
          if (result.indexOf(list[i]) < 0) result.push(list[i]);
        }
      }
    }

    for (var h = 0; h < this.hugeBoxes.length; h++) {
      result.push(this.hugeBoxes[h]);
    }
    for (var hc = 0; hc < this.hugeCircles.length; hc++) {
      result.push(this.hugeCircles[hc]);
    }
    return result;
  };

  PhysicsWorld.prototype.addForceCallback = function (callback) {
    this.forceCallbacks.push(callback);
  };

  PhysicsWorld.prototype.clear = function () {
    this.bodies.length = 0;
    this.constraints.length = 0;
    this.staticBoxes.length = 0;
    this.staticCircles.length = 0;
    this.forceCallbacks.length = 0;
    this.grid = new Map();
    this.hugeBoxes = [];
    this.hugeCircles = [];
    this.gridDirty = true;
  };

  PhysicsWorld.prototype.simulate = function (dt, substeps, iterations) {
    substeps = substeps || 3;
    iterations = iterations || 4;
    var subDt = dt / substeps;

    for (var substep = 0; substep < substeps; substep++) {
      this.simulateSubstep(subDt, iterations);
      this.time += subDt;
    }
  };

  PhysicsWorld.prototype.simulateSubstep = function (dt, iterations) {
    var bodies = this.bodies;
    var i, body;

    // --- 1. Apply all external forces -------------------------------
    for (i = 0; i < bodies.length; i++) {
      bodies[i].fx = 0;
      bodies[i].fy = 0;
    }
    for (i = 0; i < this.forceCallbacks.length; i++) {
      this.forceCallbacks[i](this, dt);
    }

    // --- 2. Integrate velocities and predict positions --------------
    var gravity = this.gravity;
    for (i = 0; i < bodies.length; i++) {
      body = bodies[i];
      if (body.fixed) {
        body._prevX = body.x;
        body._prevY = body.y;
        continue;
      }
      body.vx += (body.fx * body.invMass) * dt;
      body.vy += (gravity + body.fy * body.invMass) * dt;

      if (this.linearDamping > 0) {
        var damp = Math.max(0, 1 - this.linearDamping * dt);
        body.vx *= damp;
        body.vy *= damp;
      }

      body._prevX = body.x;
      body._prevY = body.y;
      body.x += body.vx * dt;
      body.y += body.vy * dt;

      body.touchingGround = false;
      body.touchingObstacle = false;
      body.contactNormalX = 0;
      body.contactNormalY = 0;
      body.normalCorrection = 0;
    }

    // --- 3. Solve constraints ---------------------------------------
    for (var iteration = 0; iteration < iterations; iteration++) {
      this.solveConstraints();
      this.solveCollisions(iteration === iterations - 1);
    }

    // --- 4. Derive velocities from the corrected positions ----------
    var invDt = 1 / dt;
    for (i = 0; i < bodies.length; i++) {
      body = bodies[i];
      if (body.fixed) {
        body.vx = 0;
        body.vy = 0;
        continue;
      }
      body.vx = (body.x - body._prevX) * invDt;
      body.vy = (body.y - body._prevY) * invDt;
      body._prevX = body.x;
      body._prevY = body.y;
    }
  };

  PhysicsWorld.prototype.solveConstraints = function () {
    var constraints = this.constraints;
    for (var i = 0; i < constraints.length; i++) {
      var constraint = constraints[i];
      if (!constraint.enabled) continue;

      var a = constraint.a;
      var b = constraint.b;
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 1e-9) continue;

      var difference = (distance - constraint.restLength) / distance;
      var totalInvMass = a.invMass + b.invMass;
      if (totalInvMass <= 0) continue;

      var correction = difference * constraint.stiffness / totalInvMass;
      if (!a.fixed) {
        a.x += dx * correction * a.invMass;
        a.y += dy * correction * a.invMass;
      }
      if (!b.fixed) {
        b.x -= dx * correction * b.invMass;
        b.y -= dy * correction * b.invMass;
      }
    }
  };

  /**
   * Resolves the collisions of all bodies with the static geometry.
   * `lastIteration` controls the friction pass (which is applied on the
   * accumulated normal corrections of this substep).
   */
  PhysicsWorld.prototype.solveCollisions = function (lastIteration) {
    var bodies = this.bodies;

    for (var i = 0; i < bodies.length; i++) {
      var body = bodies[i];
      if (body.fixed || !body.collides) continue;

      var candidates = this.queryStatic(body.x, body.y, body.radius);

      for (var b = 0; b < candidates.length; b++) {
        var candidate = candidates[b];
        if (candidate instanceof StaticBox) {
          var dxb = body.x - candidate.cx;
          var dyb = body.y - candidate.cy;
          var reach = candidate.boundingRadius + body.radius;
          if (dxb * dxb + dyb * dyb > reach * reach) continue;
          this.resolveBoxCollision(body, candidate);
        } else {
          var dxc = body.x - candidate.x;
          var dyc = body.y - candidate.y;
          var reachC = candidate.radius + body.radius;
          if (dxc * dxc + dyc * dyc > reachC * reachC) continue;
          this.resolveCircleCollision(body, candidate);
        }
      }

      // Friction: the tangential displacement of this substep is limited
      // by the Coulomb friction cone derived from the normal correction.
      if (lastIteration && body.normalCorrection > 0) {
        this.applyFriction(body);
      }
    }
  };

  PhysicsWorld.prototype.resolveBoxCollision = function (body, box) {
    var local = box.toLocal(body.x, body.y);
    var inside = Math.abs(local.x) <= box.hx && Math.abs(local.y) <= box.hy;

    var closestX, closestY, penetration, normalLocalX, normalLocalY;

    if (inside) {
      // Push out along the axis of the least penetration.
      var overlapX = box.hx - Math.abs(local.x);
      var overlapY = box.hy - Math.abs(local.y);
      if (overlapX < overlapY) {
        closestX = local.x < 0 ? -box.hx : box.hx;
        closestY = local.y;
        penetration = overlapX + body.radius;
        normalLocalX = local.x < 0 ? -1 : 1;
        normalLocalY = 0;
      } else {
        closestX = local.x;
        closestY = local.y < 0 ? -box.hy : box.hy;
        penetration = overlapY + body.radius;
        normalLocalX = 0;
        normalLocalY = local.y < 0 ? -1 : 1;
      }
    } else {
      closestX = Utils.clamp(local.x, -box.hx, box.hx);
      closestY = Utils.clamp(local.y, -box.hy, box.hy);
      var ddx = local.x - closestX;
      var ddy = local.y - closestY;
      var distanceSq = ddx * ddx + ddy * ddy;
      if (distanceSq > body.radius * body.radius) return;
      var distance = Math.sqrt(distanceSq);
      penetration = body.radius - distance;
      if (distance > 1e-9) {
        normalLocalX = ddx / distance;
        normalLocalY = ddy / distance;
      } else {
        normalLocalX = 0;
        normalLocalY = 1;
      }
    }

    if (penetration <= 0) return;

    var normal = box.toWorldDirection(normalLocalX, normalLocalY);
    body.x += normal.x * penetration;
    body.y += normal.y * penetration;

    body.contactNormalX += normal.x * penetration;
    body.contactNormalY += normal.y * penetration;
    body.normalCorrection += penetration;
    this.registerContact(body, box.tag, box.friction);
  };

  PhysicsWorld.prototype.resolveCircleCollision = function (body, circle) {
    var dx = body.x - circle.x;
    var dy = body.y - circle.y;
    var distance = Math.sqrt(dx * dx + dy * dy);
    var minDistance = circle.radius + body.radius;
    if (distance >= minDistance) return;

    var penetration = minDistance - distance;
    var nx, ny;
    if (distance > 1e-9) {
      nx = dx / distance;
      ny = dy / distance;
    } else {
      nx = 0;
      ny = 1;
    }

    body.x += nx * penetration;
    body.y += ny * penetration;

    body.contactNormalX += nx * penetration;
    body.contactNormalY += ny * penetration;
    body.normalCorrection += penetration;
    this.registerContact(body, circle.tag, circle.friction);
  };

  PhysicsWorld.prototype.registerContact = function (body, tag, friction) {
    if (tag === 'Ground' || tag === 'StaticForeground') {
      body.touchingGround = true;
    } else {
      body.touchingObstacle = true;
    }
    if (body.frictionOverride !== undefined && body.frictionOverride !== null) {
      friction = body.frictionOverride;
    }
    body.contactFriction = friction;
  };

  PhysicsWorld.prototype.applyFriction = function (body) {
    var correctionLength = Math.sqrt(
      body.contactNormalX * body.contactNormalX + body.contactNormalY * body.contactNormalY
    );
    if (correctionLength < 1e-12) return;

    var nx = body.contactNormalX / correctionLength;
    var ny = body.contactNormalY / correctionLength;

    var dx = body.x - body._prevX;
    var dy = body.y - body._prevY;
    var normalDisplacement = dx * nx + dy * ny;

    var tangentX = dx - normalDisplacement * nx;
    var tangentY = dy - normalDisplacement * ny;
    var tangentLength = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
    if (tangentLength < 1e-12) return;

    var friction = body.contactFriction === undefined ? 1.0 : body.contactFriction;
    var maxTangent = friction * body.normalCorrection * 1.5;
    if (tangentLength <= maxTangent) return;

    var scale = maxTangent / tangentLength;
    var newTangentX = tangentX * scale;
    var newTangentY = tangentY * scale;

    body.x = body._prevX + normalDisplacement * nx + newTangentX;
    body.y = body._prevY + normalDisplacement * ny + newTangentY;
  };

  /* ------------------------------------------------------------------ *
   * Raycasting — used by the universal brain
   * ------------------------------------------------------------------ */
  PhysicsWorld.prototype.raycast = function (ox, oy, dx, dy, maxDistance, mask) {
    var length = Math.sqrt(dx * dx + dy * dy);
    if (length < 1e-9) return null;
    dx /= length;
    dy /= length;
    if (maxDistance === undefined || maxDistance === null) maxDistance = Infinity;

    var best = null;

    var includeStatic = mask === undefined || mask === null || mask.indexOf('static') >= 0;
    var includeObstacles = mask === undefined || mask === null || mask.indexOf('obstacle') >= 0;

    var limit = maxDistance === Infinity ? 1e9 : maxDistance;

    if (includeStatic) {
      for (var i = 0; i < this.staticBoxes.length; i++) {
        var box = this.staticBoxes[i];
        // Axis aligned bounding box reject of the ray segment.
        if (!segmentIntersectsAABB(ox, oy, dx * limit, dy * limit, box)) continue;
        var hit = this.raycastBox(box, ox, oy, dx, dy, maxDistance);
        if (hit && (!best || hit.distance < best.distance)) best = hit;
      }
    }

    if (includeObstacles) {
      for (var c = 0; c < this.staticCircles.length; c++) {
        var circle = this.staticCircles[c];
        if (
          !segmentIntersectsCircleAABB(ox, oy, dx * limit, dy * limit, circle.x, circle.y, circle.radius)
        ) {
          continue;
        }
        var hitCircle = this.raycastCircle(circle, ox, oy, dx, dy, maxDistance);
        if (hitCircle && (!best || hitCircle.distance < best.distance)) best = hitCircle;
      }
    }

    return best;
  };

  PhysicsWorld.prototype.raycastBox = function (box, ox, oy, dx, dy, maxDistance) {
    var localOrigin = box.toLocal(ox, oy);
    var localDirection = box.toLocalDirection(dx, dy);

    var tmin = 0;
    var tmax = maxDistance;

    var axes = [
      { o: localOrigin.x, d: localDirection.x, h: box.hx },
      { o: localOrigin.y, d: localDirection.y, h: box.hy },
    ];

    for (var i = 0; i < 2; i++) {
      var axis = axes[i];
      if (Math.abs(axis.d) < 1e-9) {
        if (axis.o < -axis.h || axis.o > axis.h) return null;
      } else {
        var t1 = (-axis.h - axis.o) / axis.d;
        var t2 = (axis.h - axis.o) / axis.d;
        if (t1 > t2) {
          var temp = t1;
          t1 = t2;
          t2 = temp;
        }
        if (t1 > tmin) tmin = t1;
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return null;
      }
    }

    if (tmin < 0 || tmin > maxDistance) return null;

    var localPointX = localOrigin.x + localDirection.x * tmin;
    var localPointY = localOrigin.y + localDirection.y * tmin;
    var insideX = Math.abs(Math.abs(localPointX) - box.hx) < 1e-6;
    var normalLocalX = insideX ? (localPointX < 0 ? -1 : 1) : 0;
    var normalLocalY = insideX ? 0 : localPointY < 0 ? -1 : 1;
    var normal = box.toWorldDirection(normalLocalX, normalLocalY);

    return {
      distance: tmin,
      x: ox + dx * tmin,
      y: oy + dy * tmin,
      normalX: normal.x,
      normalY: normal.y,
      tag: box.tag,
      shape: box,
    };
  };

  PhysicsWorld.prototype.raycastCircle = function (circle, ox, oy, dx, dy, maxDistance) {
    var mx = ox - circle.x;
    var my = oy - circle.y;
    var b = mx * dx + my * dy;
    var c = mx * mx + my * my - circle.radius * circle.radius;
    if (c > 0 && b > 0) return null;
    var disc = b * b - c;
    if (disc < 0) return null;
    var t = -b - Math.sqrt(disc);
    if (t < 0) t = -b + Math.sqrt(disc);
    if (t < 0 || t > maxDistance) return null;
    var px = ox + dx * t;
    var py = oy + dy * t;
    var nx = px - circle.x;
    var ny = py - circle.y;
    var len = Math.sqrt(nx * nx + ny * ny);
    if (len > 1e-9) {
      nx /= len;
      ny /= len;
    }
    return {
      distance: t,
      x: px,
      y: py,
      normalX: nx,
      normalY: ny,
      tag: circle.tag,
      shape: circle,
    };
  };

  /* --- helpers for the raycast broad phase --------------------------- */
  function segmentIntersectsAABB(ox, oy, dx, dy, box) {
    // Slab test against the world space bounding box of the (rotated) box.
    var half = box.boundingRadius;
    var minX = box.cx - half;
    var maxX = box.cx + half;
    var minY = box.cy - half;
    var maxY = box.cy + half;
    var t0 = 0;
    var t1 = 1;
    if (Math.abs(dx) < 1e-9) {
      if (ox < minX || ox > maxX) return false;
    } else {
      var a = (minX - ox) / dx;
      var b = (maxX - ox) / dx;
      if (a > b) {
        var temp = a;
        a = b;
        b = temp;
      }
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, b);
      if (t0 > t1) return false;
    }
    if (Math.abs(dy) < 1e-9) {
      if (oy < minY || oy > maxY) return false;
    } else {
      var c = (minY - oy) / dy;
      var d = (maxY - oy) / dy;
      if (c > d) {
        var temp2 = c;
        c = d;
        d = temp2;
      }
      t0 = Math.max(t0, c);
      t1 = Math.min(t1, d);
      if (t0 > t1) return false;
    }
    return true;
  }

  function segmentIntersectsCircleAABB(ox, oy, dx, dy, cx, cy, radius) {
    var half = radius * 1.4143;
    var minX = cx - half;
    var maxX = cx + half;
    var minY = cy - half;
    var maxY = cy + half;
    return segmentIntersectsAABB(ox, oy, dx, dy, {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      boundingRadius: half,
    });
  }

  EVO.PhysicsBody = PhysicsBody;
  EVO.DistanceConstraint = DistanceConstraint;
  EVO.StaticBox = StaticBox;
  EVO.StaticCircle = StaticCircle;
  EVO.PhysicsWorld = PhysicsWorld;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
