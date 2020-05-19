import * as THREE from 'three';
import Earcut from 'earcut';
import Coordinates from 'Core/Geographic/Coordinates';
import { FEATURE_TYPES } from 'Core/Feature';

function getProperty(name, options, defaultValue, ...args) {
    const property = options[name];

    if (property) {
        if (typeof property === 'function') {
            const p = property(...args);
            if (p) {
                return p;
            }
        } else {
            return property;
        }
    }

    if (typeof defaultValue === 'function') {
        return defaultValue(...args);
    }

    return defaultValue;
}

function randomColor() {
    return new THREE.Color(Math.random() * 0xffffff);
}

function fillColorArray(colors, length, color, offset = 0) {
    offset *= 3;
    const len = offset + length * 3;
    for (let i = offset; i < len; i += 3) {
        colors[i] = color.r * 255;
        colors[i + 1] = color.g * 255;
        colors[i + 2] = color.b * 255;
    }
}

/*
function fillBatchIdArray(batchId, batchIdArray, start, end) {
    for (let i = start; i < end; i++) {
        batchIdArray[i] = batchId;
    }
}
*/

/**
 * Convert coordinates to vertices positionned at a given altitude
 *
 * @param      {number[]} ptsIn - Coordinates of a feature.
 * @param      {number[]} normals - Coordinates of a feature.
 * @param      {number[]} target - Target to copy result.
 * @param      {(Function|number)}  altitude - Altitude of feature or function to get altitude.
 * @param      {number} extrude - The extrude amount to apply at each point
 * @param      {number} offsetOut - The offset array value to copy on target
 * @param      {number} countIn - The count of coordinates to read in ptsIn
 * @param      {number} startIn - The offser array to strat reading in ptsIn
 */
const coord = new Coordinates('EPSG:4326', 0, 0);
function coordinatesToVertices(ptsIn, normals, target, altitude = 0, extrude = 0, offsetOut = 0, countIn = ptsIn.length / 3, startIn = offsetOut) {
    startIn *= 3;
    countIn *= 3;
    offsetOut *= 3;
    const endIn = startIn + countIn;
    let fnAltitude;
    if (!isNaN(altitude)) {
        fnAltitude = () => altitude;
    } else if (Array.isArray(altitude)) {
        fnAltitude = id => altitude[(id - startIn) / 3];
    } else {
        fnAltitude = id => altitude({}, coord.set(ptsIn.crs, ptsIn[id], ptsIn[id + 1], ptsIn[id + 2]));
    }

    for (let i = startIn, j = offsetOut; i < endIn; i += 3, j += 3) {
        // move the vertex following the normal, to put the point on the good altitude
        const t = fnAltitude(i) + (Array.isArray(extrude) ? extrude[(i - startIn) / 3] : extrude);
        if (target.minAltitude) {
            target.minAltitude = Math.min(t, target.minAltitude);
        }
        // fill the vertices array at the offset position
        target[j] = ptsIn[i] + normals[i] * t;
        target[j + 1] = ptsIn[i + 1] + normals[i + 1] * t;
        target[j + 2] = ptsIn[i + 2] + normals[i + 2] * t;
    }
}


// Ugly conversion, many coordinates created
// Todo: avoid converting to 4326
function addExtrudedPolygonSideFacesWithDup(vEdges, uvsEdges, uvs, arrVertices, vertices, indices, length, offset, count, isClockWise) {
    // loop over contour length, and for each point of the contour,
    // add indices to make two triangle, that make the side face
    const startIndice = indices.length;
    indices.length += (count - 1) * 6;


    for (let i = offset, j = startIndice; i < offset + count - 1; ++i, ++j) {
        if (isClockWise) {
            // first triangle indices

            indices[j] = i; arrVertices.push(vertices[indices[j] * 3], vertices[indices[j] * 3 + 1], vertices[indices[j] * 3 + 2]);
            indices[++j] = i + length; arrVertices.push(vertices[indices[j] * 3], vertices[indices[j] * 3 + 1], vertices[indices[j] * 3 + 2]);
            indices[++j] = i + 1; arrVertices.push(vertices[indices[j] * 3], vertices[indices[j] * 3 + 1], vertices[indices[j] * 3 + 2]);

            // second triangle indicesw
            indices[++j] = i + 1; arrVertices.push(vertices[indices[j] * 3], vertices[indices[j] * 3 + 1], vertices[indices[j] * 3 + 2]);
            indices[++j] = i + length; arrVertices.push(vertices[indices[j] * 3], vertices[indices[j] * 3 + 1], vertices[indices[j] * 3 + 2]);
            indices[++j] = i + length + 1; arrVertices.push(vertices[indices[j] * 3], vertices[indices[j] * 3 + 1], vertices[indices[j] * 3 + 2]);

            const uvCoordA = new Coordinates('EPSG:4978', vertices[indices[j - 5] * 3], vertices[indices[j - 5] * 3 + 1], vertices[indices[j - 5] * 3 + 2])/* .as('EPSG:4326') */;
            const uvCoordB = new Coordinates('EPSG:4978', vertices[indices[j - 4] * 3], vertices[indices[j - 4] * 3 + 1], vertices[indices[j - 4] * 3 + 2])/* .as('EPSG:4326') */;
            // const uvCoordC = new Coordinates('EPSG:4978', vertices[indices[j - 3] * 3], vertices[indices[j - 3] * 3 + 1], vertices[indices[j - 3] * 3 + 2]).as('EPSG:4326');
            const uvCoordD = new Coordinates('EPSG:4978', vertices[indices[j] * 3], vertices[indices[j] * 3 + 1], vertices[indices[j] * 3 + 2])/* .as('EPSG:4326') */;

            const h = 1; /* uvCoordA.z - uvCoordB.z; //* uvCoordB._values[2] - uvCoordA._values[2] ; */
            const l = 1; /* Math.sqrt((uvCoordD.x - uvCoordB.x) * (uvCoordD.x - uvCoordB.x) + (uvCoordB.y * uvCoordB.y) * (uvCoordD.y * uvCoordD.y)); */

            uvs.push(0, h);
            uvs.push(0, 0);
            uvs.push(l, h);
            uvs.push(l, h);
            uvs.push(0, 0);
            uvs.push(l, 0);
            // For lines:
            vEdges.push(vertices[indices[j - 5] * 3], vertices[indices[j - 5] * 3 + 1], vertices[indices[j - 5] * 3 + 2]);
            vEdges.push(vertices[indices[j - 4] * 3], vertices[indices[j - 4] * 3 + 1], vertices[indices[j - 4] * 3 + 2]);

            vEdges.push(vertices[indices[j - 5] * 3], vertices[indices[j - 5] * 3 + 1], vertices[indices[j - 5] * 3 + 2]);
            vEdges.push(vertices[indices[j - 3] * 3], vertices[indices[j - 3] * 3 + 1], vertices[indices[j - 3] * 3 + 2]);
        } else {
            // first triangle indices
            indices[j] = i + length; arrVertices.push(vertices[indices[j] * 3], vertices[indices[j] * 3 + 1], vertices[indices[j] * 3 + 2]);
            indices[++j] = i; arrVertices.push(vertices[indices[j] * 3], vertices[indices[j] * 3 + 1], vertices[indices[j] * 3 + 2]);
            indices[++j] = i + length + 1; arrVertices.push(vertices[indices[j] * 3], vertices[indices[j] * 3 + 1], vertices[indices[j] * 3 + 2]);
            // second triangle indices
            indices[++j] = i + length + 1; arrVertices.push(vertices[indices[j] * 3], vertices[indices[j] * 3 + 1], vertices[indices[j] * 3 + 2]);
            indices[++j] = i; arrVertices.push(vertices[indices[j] * 3], vertices[indices[j] * 3 + 1], vertices[indices[j] * 3 + 2]);
            indices[++j] = i + 1; arrVertices.push(vertices[indices[j] * 3], vertices[indices[j] * 3 + 1], vertices[indices[j] * 3 + 2]);


            const uvCoordA = new Coordinates('EPSG:4978', vertices[indices[j - 5] * 3], vertices[indices[j - 5] * 3 + 1], vertices[indices[j - 5] * 3 + 2]) /* .as('EPSG:4326') */;
            const uvCoordB = new Coordinates('EPSG:4978', vertices[indices[j - 4] * 3], vertices[indices[j - 4] * 3 + 1], vertices[indices[j - 4] * 3 + 2]) /* .as('EPSG:4326') */;
            // const uvCoordC = new Coordinates('EPSG:4978', vertices[indices[j - 3] * 3], vertices[indices[j - 3] * 3 + 1], vertices[indices[j - 3] * 3 + 2]).as('EPSG:4326');
            const uvCoordD = new Coordinates('EPSG:4978', vertices[indices[j] * 3], vertices[indices[j] * 3 + 1], vertices[indices[j] * 3 + 2])/* .as('EPSG:4326') */;

            const h = 1; /* uvCoordA.z - uvCoordB.z;// uvCoordB._values[2] - uvCoordA._values[2] ; */
            const l =  1; /* Math.sqrt((uvCoordD.x - uvCoordB.x) * (uvCoordD.x - uvCoordB.x) + (uvCoordD.y - uvCoordB.y) * (uvCoordD.y - uvCoordB.y)); */

            // console.log("llll:", l);
            // console.log("hhhhh:", h)
            uvs.push(0, h);
            uvs.push(0, 0);
            uvs.push(l, h);
            uvs.push(l, h);
            uvs.push(0, 0);
            uvs.push(l, 0);
            // For lines:

            vEdges.push(vertices[indices[j - 5] * 3], vertices[indices[j - 5] * 3 + 1], vertices[indices[j - 5] * 3 + 2]);
            vEdges.push(vertices[indices[j - 4] * 3], vertices[indices[j - 4] * 3 + 1], vertices[indices[j - 4] * 3 + 2]);

            vEdges.push(vertices[indices[j - 5] * 3], vertices[indices[j - 5] * 3 + 1], vertices[indices[j - 5] * 3 + 2]);
            vEdges.push(vertices[indices[j - 3] * 3], vertices[indices[j - 3] * 3 + 1], vertices[indices[j - 3] * 3 + 2]);

            // vEdges.push(vertices[indices[j-4] * 3 ], vertices[indices[j-4] * 3 +1], vertices[indices[j-4] * 3 +2]);
        }
    }
}


const pointMaterial = new THREE.PointsMaterial();
function featureToPoint(feature, options) {
    const ptsIn = feature.vertices;
    const normals = feature.normals;
    const vertices = new Float32Array(ptsIn.length);
    const colors = new Uint8Array(ptsIn.length);

    const batchIds = options.batchId ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds1 = options.batchId1 ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds2 = options.batchId2 ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds3 = options.batchId3 ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds4 = options.batchId4 ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds5 = options.batchId5 ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds6 = options.batchId6 ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds7 = options.batchId7 ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds8 = options.batchId8 ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds9 = options.batchId9 ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds10 = options.batchId10 ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds11 = options.batchId11 ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds12 = options.batchId12 ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds13 = options.batchId13 ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds14 = options.batchId14 ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds15 = options.batchId15 ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds16 = options.batchId16 ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds17 = options.batchId17 ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds18 = options.batchId18 ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds19 = options.batchId19 ? new Uint32Array(ptsIn.length / 3) : undefined;
    const batchIds20 = options.batchId20 ? new Uint32Array(ptsIn.length / 3) : undefined;
    let featureId = 0;
    let featureId1 = 0;
    let featureId2 = 0;
    let featureId3 = 0;
    let featureId4 = 0;
    let featureId5 = 0;
    let featureId6 = 0;
    let featureId7 = 0;
    let featureId8 = 0;
    let featureId9 = 0;
    let featureId10 = 0;
    let featureId11 = 0;
    let featureId12 = 0;
    let featureId13 = 0;
    let featureId14 = 0;
    let featureId15 = 0;
    let featureId16 = 0;
    let featureId17 = 0;
    let featureId18 = 0;
    let featureId19 = 0;
    let featureId20 = 0;
    

    coordinatesToVertices(ptsIn, normals, vertices, options.altitude);

    for (const geometry of feature.geometry) {
        const color = getProperty('color', options, randomColor, geometry.properties);
        const start = geometry.indices[0].offset;
        const count = geometry.indices[0].count;
        fillColorArray(colors, count, color, start);

        if (batchIds) {
            const id = options.batchId(geometry.properties, featureId);
            for (let i = start; i < start + count; i++) {
                batchIds[i] = id;
            }
            featureId++;
        }
        if (batchIds1) {
            const id1 = options.batchId1(geometry.properties, featureId1);
            for (let i = start; i < start + count; i++) {
                batchIds1[i] = id1;
            }
            featureId1++;
        }
        if (batchIds2) {
            const id2 = options.batchId2(geometry.properties, featureId2);
            for (let i = start; i < start + count; i++) {
                batchIds2[i] = id2;
            }
            featureId2++;
        }
        if (batchIds3) {
            const id3 = options.batchId3(geometry.properties, featureId3);
            for (let i = start; i < start + count; i++) {
                batchIds3[i] = id3;
            }
            featureId3++;
        }
        if (batchIds4) {
            const id4 = options.batchId4(geometry.properties, featureId4);
            for (let i = start; i < start + count; i++) {
                batchIds4[i] = id4;
            }
            featureId4++;
        }
        if (batchIds5) {
            const id5 = options.batchId5(geometry.properties, featureId5);
            for (let i = start; i < start + count; i++) {
                batchIds5[i] = id5;
            }
            featureId5++;
        }
        if (batchIds6) {
            const id6 = options.batchId6(geometry.properties, featureId6);
            for (let i = start; i < start + count; i++) {
                batchIds6[i] = id6;
            }
            featureId6++;
        }
        if (batchIds7) {
            const id7 = options.batchId7(geometry.properties, featureId7);
            for (let i = start; i < start + count; i++) {
                batchIds7[i] = id7;
            }
            featureId7++;
        }
        if (batchIds8) {
            const id8 = options.batchId8(geometry.properties, featureId8);
            for (let i = start; i < start + count; i++) {
                batchIds8[i] = id8;
            }
            featureId8++;
        }
        if (batchIds9) {
            const id9 = options.batchId9(geometry.properties, featureId9);
            for (let i = start; i < start + count; i++) {
                batchIds9[i] = id9;
            }
            featureId9++;
        }
        if (batchIds10) {
            const id10 = options.batchId10(geometry.properties, featureId10);
            for (let i = start; i < start + count; i++) {
                batchIds10[i] = id10;
            }
            featureId10++;
        }
        if (batchIds11) {
            const id11 = options.batchId11(geometry.properties, featureId11);
            for (let i = start; i < start + count; i++) {
                batchIds11[i] = id11;
            }
            featureId11++;
        }
        if (batchIds12) {
            const id12 = options.batchId12(geometry.properties, featureId12);
            for (let i = start; i < start + count; i++) {
                batchIds12[i] = id12;
            }
            featureId12++;
        }
        if (batchIds13) {
            const id13 = options.batchId13(geometry.properties, featureId13);
            for (let i = start; i < start + count; i++) {
                batchIds13[i] = id13;
            }
            featureId13++;
        }
        if (batchIds14) {
            const id14 = options.batchId14(geometry.properties, featureId14);
            for (let i = start; i < start + count; i++) {
                batchIds14[i] = id14;
            }
            featureId14++;
        }
        if (batchIds15) {
            const id15 = options.batchId15(geometry.properties, featureId15);
            for (let i = start; i < start + count; i++) {
                batchIds15[i] = id15;
            }
            featureId15++;
        }
        if (batchIds16) {
            const id16 = options.batchId16(geometry.properties, featureId16);
            for (let i = start; i < start + count; i++) {
                batchIds16[i] = id16;
            }
            featureId16++;
        }
        if (batchIds17) {
            const id17 = options.batchId17(geometry.properties, featureId17);
            for (let i = start; i < start + count; i++) {
                batchIds17[i] = id17;
            }
            featureId17++;
        }
        if (batchIds18) {
            const id18 = options.batchId18(geometry.properties, featureId18);
            for (let i = start; i < start + count; i++) {
                batchIds18[i] = id18;
            }
            featureId18++;
        }
        if (batchIds19) {
            const id19 = options.batchId19(geometry.properties, featureId19);
            for (let i = start; i < start + count; i++) {
                batchIds19[i] = id19;
            }
            featureId19++;
        }
        if (batchIds20) {
            const id20 = options.batchId20(geometry.properties, featureId20);
            for (let i = start; i < start + count; i++) {
                batchIds20[i] = id20;
            }
            featureId20++;
        }
        
    }

    const geom = new THREE.BufferGeometry();
    geom.addAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geom.addAttribute('color', new THREE.BufferAttribute(colors, 3, true));
    if (batchIds) { geom.addAttribute('batchId', new THREE.BufferAttribute(batchIds, 1)); }
    if (batchIds1) { geom.addAttribute('batchId1', new THREE.BufferAttribute(batchIds1, 1)); }
    if (batchIds2) { geom.addAttribute('batchId2', new THREE.BufferAttribute(batchIds2, 1)); }
    if (batchIds3) { geom.addAttribute('batchId3', new THREE.BufferAttribute(batchIds3, 1)); }
    if (batchIds4) { geom.addAttribute('batchId4', new THREE.BufferAttribute(batchIds4, 1)); }
    if (batchIds5) { geom.addAttribute('batchId5', new THREE.BufferAttribute(batchIds5, 1)); }
    if (batchIds6) { geom.addAttribute('batchId6', new THREE.BufferAttribute(batchIds6, 1)); }
    if (batchIds7) { geom.addAttribute('batchId7', new THREE.BufferAttribute(batchIds7, 1)); }
    if (batchIds8) { geom.addAttribute('batchId8', new THREE.BufferAttribute(batchIds8, 1)); }
    if (batchIds9) { geom.addAttribute('batchId9', new THREE.BufferAttribute(batchIds9, 1)); }
    if (batchIds10) { geom.addAttribute('batchId10', new THREE.BufferAttribute(batchIds10, 1)); }
    if (batchIds11) { geom.addAttribute('batchId11', new THREE.BufferAttribute(batchIds11, 1)); }
    if (batchIds12) { geom.addAttribute('batchId12', new THREE.BufferAttribute(batchIds12, 1)); }
    if (batchIds13) { geom.addAttribute('batchId13', new THREE.BufferAttribute(batchIds13, 1)); }
    if (batchIds14) { geom.addAttribute('batchId14', new THREE.BufferAttribute(batchIds14, 1)); }
    if (batchIds15) { geom.addAttribute('batchId15', new THREE.BufferAttribute(batchIds15, 1)); }
    if (batchIds16) { geom.addAttribute('batchId16', new THREE.BufferAttribute(batchIds16, 1)); }
    if (batchIds17) { geom.addAttribute('batchId17', new THREE.BufferAttribute(batchIds17, 1)); }
    if (batchIds18) { geom.addAttribute('batchId18', new THREE.BufferAttribute(batchIds18, 1)); }
    if (batchIds19) { geom.addAttribute('batchId19', new THREE.BufferAttribute(batchIds19, 1)); }
    if (batchIds20) { geom.addAttribute('batchId20', new THREE.BufferAttribute(batchIds2à, 1)); }

    return new THREE.Points(geom, pointMaterial);
}

var lineMaterial = new THREE.LineBasicMaterial({ vertexColors: THREE.VertexColors, transparent: true, opacity: 0.2 });

// Modified version for geovis team
function featureToLine(feature, options) {
    const ptsIn = feature.vertices;

    const normals = feature.normals;
    const vertices = new Float32Array(ptsIn.length);

    const colors = new Uint8Array(ptsIn.length);
    const count = ptsIn.length / 3;

    const batchIds = options.batchId ? new Uint32Array(count) : undefined;
    let featureId = 0;
    const batchIds1 = options.batchId1 ? new Uint32Array(count) : undefined;
    let featureId1 = 0;
    const batchIds2 = options.batchId2 ? new Uint32Array(count) : undefined;
    let featureId2 = 0;
    const batchIds3 = options.batchId3 ? new Uint32Array(count) : undefined;
    let featureId3 = 0;
    const batchIds4 = options.batchId4 ? new Uint32Array(count) : undefined;
    let featureId4 = 0;
    const batchIds5 = options.batchId5 ? new Uint32Array(count) : undefined;
    let featureId5 = 0;
    const batchIds6 = options.batchId6 ? new Uint32Array(count) : undefined;
    let featureId6 = 0;
    const batchIds7 = options.batchId7 ? new Uint32Array(count) : undefined;
    let featureId7 = 0;
    const batchIds8 = options.batchId8 ? new Uint32Array(count) : undefined;
    let featureId8 = 0;
    const batchIds9 = options.batchId9 ? new Uint32Array(count) : undefined;
    let featureId9 = 0;
    const batchIds10 = options.batchId10 ? new Uint32Array(count) : undefined;
    let featureId10 = 0;
    const batchIds11 = options.batchId11 ? new Uint32Array(count) : undefined;
    let featureId11 = 0;
    const batchIds12 = options.batchId12 ? new Uint32Array(count) : undefined;
    let featureId12 = 0;
    const batchIds13 = options.batchId13 ? new Uint32Array(count) : undefined;
    let featureId13 = 0;
    const batchIds14 = options.batchId14 ? new Uint32Array(count) : undefined;
    let featureId14 = 0;
    const batchIds15 = options.batchId15 ? new Uint32Array(count) : undefined;
    let featureId15 = 0;
    const batchIds16 = options.batchId16 ? new Uint32Array(count) : undefined;
    let featureId16 = 0;
    const batchIds17 = options.batchId17 ? new Uint32Array(count) : undefined;
    let featureId17 = 0;
    const batchIds18 = options.batchId18 ? new Uint32Array(count) : undefined;
    let featureId18 = 0;
    const batchIds19 = options.batchId19 ? new Uint32Array(count) : undefined;
    let featureId19 = 0;
    const batchIds20 = options.batchId20 ? new Uint32Array(count) : undefined;
    let featureId20 = 0;

    coordinatesToVertices(ptsIn, normals, vertices, options.altitude);
    // console.log(vertices);
    const geom = new THREE.BufferGeometry();

    var verticesUnindexed = [];
    var speed = [];

    if (feature.geometry.length > 1) {
        const countIndices = (count - feature.geometry.length) * 2;
        const indices = new Uint16Array(countIndices);
        let i = 0;
        // Multi line case
        for (const geometry of feature.geometry) {
            const color = getProperty('color', options, randomColor, geometry.properties);

            const start = geometry.indices[0].offset;
            // To avoid integer overflow with indice value (16 bits)
            if (start > 0xffff) {
                console.warn('Feature to Line: integer overflow, too many points in lines');
                break;
            }
            const count = geometry.indices[0].count;
            const end = start + count;
            fillColorArray(colors, count, color, start);
            for (let j = start; j < end - 1; j++) {
                if (j < 0xffff) {
                    indices[i++] = j;
                    indices[i++] = j + 1;

                    // Modification for unindexed and multiple lines overlapping. We add also other attributes such as random speed
                    verticesUnindexed.push(vertices[j * 3], vertices[j * 3 + 1], vertices[j * 3 + 2], vertices[(j + 1) * 3], vertices[(j + 1) * 3 + 1], vertices[(j + 1) * 3 + 2]);
                    speed.push(Math.random(), Math.random());
                    // We deplicate with noise the lines
                    var nDup = 0;
                    var coefNoise = 0.0;
                    for (var k = 0; k < nDup; ++k) {
                        verticesUnindexed.push(vertices[j * 3] + Math.random() * coefNoise, vertices[j * 3 + 1] + Math.random() * coefNoise, vertices[j * 3 + 2] + Math.random() * coefNoise,
                            vertices[(j + 1) * 3] + Math.random() * coefNoise, vertices[(j + 1) * 3 + 1] + Math.random() * coefNoise, vertices[(j + 1) * 3 + 2] + Math.random() * coefNoise);
                        speed.push(Math.random(), Math.random());
                    }
                } else {
                    break;
                }
            }
            if (batchIds) {
                const id = options.batchId(geometry.properties, featureId);
                for (let i = start; i < end; i++) {
                    batchIds[i] = id;
                }
                featureId++;
            }
            if (batchIds1) {
                const id1 = options.batchId1(geometry.properties, featureId1);
                for (let i = start; i < end; i++) {
                    batchIds1[i] = id1;
                }
                featureId1++;
            }
            if (batchIds2) {
                const id2 = options.batchId2(geometry.properties, featureId2);
                for (let i = start; i < end; i++) {
                    batchIds2[i] = id2;
                }
                featureId2++;
            }
            if (batchIds3) {
                const id3 = options.batchId3(geometry.properties, featureId3);
                for (let i = start; i < end; i++) {
                    batchIds3[i] = id3;
                }
                featureId3++;
            }
            if (batchIds4) {
                const id4 = options.batchId4(geometry.properties, featureId4);
                for (let i = start; i < end; i++) {
                    batchIds4[i] = id4;
                }
                featureId4++;
            }
            if (batchIds5) {
                const id5 = options.batchId5(geometry.properties, featureId5);
                for (let i = start; i < end; i++) {
                    batchIds5[i] = id5;
                }
                featureId5++;
            }
            if (batchIds6) {
                const id6 = options.batchId6(geometry.properties, featureId6);
                for (let i = start; i < end; i++) {
                    batchIds6[i] = id6;
                }
                featureId6++;
            }
            if (batchIds7) {
                const id7 = options.batchId7(geometry.properties, featureId7);
                for (let i = start; i < end; i++) {
                    batchIds7[i] = id7;
                }
                featureId7++;
            }
            if (batchIds8) {
                const id8 = options.batchId8(geometry.properties, featureId8);
                for (let i = start; i < end; i++) {
                    batchIds8[i] = id8;
                }
                featureId8++;
            }
            if (batchIds9) {
                const id9 = options.batchId9(geometry.properties, featureId9);
                for (let i = start; i < end; i++) {
                    batchIds9[i] = id9;
                }
                featureId9++;
            }
            if (batchIds10) {
                const id10 = options.batchId10(geometry.properties, featureId10);
                for (let i = start; i < end; i++) {
                    batchIds10[i] = id10;
                }
                featureId10++;
            }
            if (batchIds11) {
                const id11 = options.batchId11(geometry.properties, featureId11);
                for (let i = start; i < end; i++) {
                    batchIds11[i] = id11;
                }
                featureId11++;
            }
            if (batchIds12) {
                const id12 = options.batchId12(geometry.properties, featureId12);
                for (let i = start; i < end; i++) {
                    batchIds12[i] = id12;
                }
                featureId12++;
            }
            if (batchIds13) {
                const id13 = options.batchId13(geometry.properties, featureId13);
                for (let i = start; i < end; i++) {
                    batchIds13[i] = id13;
                }
                featureId13++;
            }
            if (batchIds14) {
                const id14 = options.batchId14(geometry.properties, featureId14);
                for (let i = start; i < end; i++) {
                    batchIds14[i] = id14;
                }
                featureId14++;
            }
            if (batchIds15) {
                const id15 = options.batchId15(geometry.properties, featureId15);
                for (let i = start; i < end; i++) {
                    batchIds15[i] = id15;
                }
                featureId15++;
            }
            if (batchIds16) {
                const id16 = options.batchId16(geometry.properties, featureId16);
                for (let i = start; i < end; i++) {
                    batchIds16[i] = id16;
                }
                featureId16++;
            }
            if (batchIds17) {
                const id17 = options.batchId17(geometry.properties, featureId17);
                for (let i = start; i < end; i++) {
                    batchIds17[i] = id17;
                }
                featureId17++;
            }
            if (batchIds18) {
                const id18 = options.batchId18(geometry.properties, featureId18);
                for (let i = start; i < end; i++) {
                    batchIds18[i] = id18;
                }
                featureId18++;
            }
            if (batchIds19) {
                const id19 = options.batchId19(geometry.properties, featureId19);
                for (let i = start; i < end; i++) {
                    batchIds19[i] = id19;
                }
                featureId19++;
            }
            if (batchIds20) {
                const id20 = options.batchId20(geometry.properties, featureId20);
                for (let i = start; i < end; i++) {
                    batchIds20[i] = id20;
                }
                featureId20++;
            }
        }
        //  itowns.proj4.defs('EPSG:2154', '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
        // geom.addAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geom.addAttribute('position', new THREE.BufferAttribute(new Float32Array(verticesUnindexed), 3));
        //   geom.addAttribute('positionLambert93', new THREE.BufferAttribute(new Float32Array(verticesUnindexed), 3));
        geom.addAttribute('speed', new THREE.BufferAttribute(new Float32Array(speed), 1));
        // geom.addAttribute('color', new THREE.BufferAttribute(colors, 3, true));
        if (batchIds) { geom.addAttribute('batchId', new THREE.BufferAttribute(batchIds, 1)); }
        if (batchIds1) { geom.addAttribute('batchId1', new THREE.BufferAttribute(batchIds1, 1)); }
        if (batchIds2) { geom.addAttribute('batchId2', new THREE.BufferAttribute(batchIds2, 1)); }
        if (batchIds3) { geom.addAttribute('batchId3', new THREE.BufferAttribute(batchIds3, 1)); }
        if (batchIds4) { geom.addAttribute('batchId4', new THREE.BufferAttribute(batchIds4, 1)); }
        if (batchIds5) { geom.addAttribute('batchId5', new THREE.BufferAttribute(batchIds5, 1)); }
        if (batchIds6) { geom.addAttribute('batchId6', new THREE.BufferAttribute(batchIds6, 1)); }
        if (batchIds7) { geom.addAttribute('batchId7', new THREE.BufferAttribute(batchIds7, 1)); }
        if (batchIds8) { geom.addAttribute('batchId8', new THREE.BufferAttribute(batchIds8, 1)); }
        if (batchIds9) { geom.addAttribute('batchId9', new THREE.BufferAttribute(batchIds9, 1)); }
        if (batchIds10) { geom.addAttribute('batchId10', new THREE.BufferAttribute(batchIds10, 1)); }
        if (batchIds11) { geom.addAttribute('batchId11', new THREE.BufferAttribute(batchIds11, 1)); }
        if (batchIds12) { geom.addAttribute('batchId12', new THREE.BufferAttribute(batchIds12, 1)); }
        if (batchIds13) { geom.addAttribute('batchId13', new THREE.BufferAttribute(batchIds13, 1)); }
        if (batchIds14) { geom.addAttribute('batchId14', new THREE.BufferAttribute(batchIds14, 1)); }
        if (batchIds15) { geom.addAttribute('batchId15', new THREE.BufferAttribute(batchIds15, 1)); }
        if (batchIds16) { geom.addAttribute('batchId16', new THREE.BufferAttribute(batchIds16, 1)); }
        if (batchIds17) { geom.addAttribute('batchId17', new THREE.BufferAttribute(batchIds17, 1)); }
        if (batchIds18) { geom.addAttribute('batchId18', new THREE.BufferAttribute(batchIds18, 1)); }
        if (batchIds19) { geom.addAttribute('batchId19', new THREE.BufferAttribute(batchIds19, 1)); }
        if (batchIds20) { geom.addAttribute('batchId20', new THREE.BufferAttribute(batchIds20, 1)); }
        // geom.setIndex(new THREE.BufferAttribute(indices, 1));
        // console.log(geom);
        return new THREE.LineSegments(geom, /* materialLiness */ lineMaterial);
    } else {
        const color = getProperty('color', options, randomColor, feature.geometry.properties);
        fillColorArray(colors, count, color);
        geom.addAttribute('color', new THREE.BufferAttribute(colors, 3, true));
        if (batchIds) {
            const id = options.batchId(feature.geometry.properties, featureId);
            for (let i = 0; i < count; i++) {
                batchIds[i] = id;
            }
            geom.addAttribute('batchId', new THREE.BufferAttribute(batchIds, 1));
        }
        if (batchIds1) {
            const id1 = options.batchId1(feature.geometry.properties, featureId1);
            for (let i = 0; i < count; i++) {
                batchIds1[i] = id1;
            }
            geom.addAttribute('batchId1', new THREE.BufferAttribute(batchIds1, 1));
        }
        if (batchIds2) {
            const id2 = options.batchId2(feature.geometry.properties, featureId2);
            for (let i = 0; i < count; i++) {
                batchIds2[i] = id2;
            }
            geom.addAttribute('batchId2', new THREE.BufferAttribute(batchIds2, 1));
        }
        if (batchIds3) {
            const id3 = options.batchId3(feature.geometry.properties, featureId3);
            for (let i = 0; i < count; i++) {
                batchIds3[i] = id3;
            }
            geom.addAttribute('batchId3', new THREE.BufferAttribute(batchIds3, 1));
        }
        if (batchIds4) {
            const id4 = options.batchId4(feature.geometry.properties, featureId4);
            for (let i = 0; i < count; i++) {
                batchIds4[i] = id4;
            }
            geom.addAttribute('batchId4', new THREE.BufferAttribute(batchIds4, 1));
        }
        if (batchIds5) {
            const id5 = options.batchId5(feature.geometry.properties, featureId5);
            for (let i = 0; i < count; i++) {
                batchIds5[i] = id5;
            }
            geom.addAttribute('batchId5', new THREE.BufferAttribute(batchIds5, 1));
        }
        if (batchIds6) {
            const id6 = options.batchId6(feature.geometry.properties, featureId6);
            for (let i = 0; i < count; i++) {
                batchIds6[i] = id6;
            }
            geom.addAttribute('batchId6', new THREE.BufferAttribute(batchIds6, 1));
        }
        if (batchIds7) {
            const id7 = options.batchId7(feature.geometry.properties, featureId7);
            for (let i = 0; i < count; i++) {
                batchIds7[i] = id7;
            }
            geom.addAttribute('batchId7', new THREE.BufferAttribute(batchIds7, 1));
        }
        if (batchIds8) {
            const id8 = options.batchId8(feature.geometry.properties, featureId8);
            for (let i = 0; i < count; i++) {
                batchIds8[i] = id8;
            }
            geom.addAttribute('batchId8', new THREE.BufferAttribute(batchIds8, 1));
        }
        if (batchIds9) {
            const id9 = options.batchId9(feature.geometry.properties, featureId9);
            for (let i = 0; i < count; i++) {
                batchIds9[i] = id9;
            }
            geom.addAttribute('batchId9', new THREE.BufferAttribute(batchIds9, 1));
        }
        if (batchIds10) {
            const id10 = options.batchId10(feature.geometry.properties, featureId10);
            for (let i = 0; i < count; i++) {
                batchIds10[i] = id10;
            }
            geom.addAttribute('batchId10', new THREE.BufferAttribute(batchIds10, 1));
        }
        if (batchIds11) {
            const id11 = options.batchId11(feature.geometry.properties, featureId11);
            for (let i = 0; i < count; i++) {
                batchIds11[i] = id11;
            }
            geom.addAttribute('batchId11', new THREE.BufferAttribute(batchIds11, 1));
        }
        if (batchIds12) {
            const id12 = options.batchId12(feature.geometry.properties, featureId12);
            for (let i = 0; i < count; i++) {
                batchIds12[i] = id12;
            }
            geom.addAttribute('batchId12', new THREE.BufferAttribute(batchIds12, 1));
        }
        if (batchIds13) {
            const id13 = options.batchId13(feature.geometry.properties, featureId13);
            for (let i = 0; i < count; i++) {
                batchIds13[i] = id13;
            }
            geom.addAttribute('batchId13', new THREE.BufferAttribute(batchIds13, 1));
        }
        if (batchIds14) {
            const id14 = options.batchId14(feature.geometry.properties, featureId14);
            for (let i = 0; i < count; i++) {
                batchIds14[i] = id14;
            }
            geom.addAttribute('batchId14', new THREE.BufferAttribute(batchIds14, 1));
        }
        if (batchIds15) {
            const id15 = options.batchId15(feature.geometry.properties, featureId15);
            for (let i = 0; i < count; i++) {
                batchIds15[i] = id15;
            }
            geom.addAttribute('batchId15', new THREE.BufferAttribute(batchIds15, 1));
        }
        if (batchIds16) {
            const id16 = options.batchId16(feature.geometry.properties, featureId16);
            for (let i = 0; i < count; i++) {
                batchIds16[i] = id16;
            }
            geom.addAttribute('batchId16', new THREE.BufferAttribute(batchIds16, 1));
        }
        if (batchIds17) {
            const id17 = options.batchId17(feature.geometry.properties, featureId17);
            for (let i = 0; i < count; i++) {
                batchIds17[i] = id17;
            }
            geom.addAttribute('batchId17', new THREE.BufferAttribute(batchIds17, 1));
        }
        if (batchIds18) {
            const id18 = options.batchId18(feature.geometry.properties, featureId18);
            for (let i = 0; i < count; i++) {
                batchIds18[i] = id18;
            }
            geom.addAttribute('batchId18', new THREE.BufferAttribute(batchIds18, 1));
        }
        if (batchIds19) {
            const id19 = options.batchId19(feature.geometry.properties, featureId19);
            for (let i = 0; i < count; i++) {
                batchIds19[i] = id19;
            }
            geom.addAttribute('batchId19', new THREE.BufferAttribute(batchIds19, 1));
        }
        if (batchIds20) {
            const id20 = options.batchId20(feature.geometry.properties, featureId20);
            for (let i = 0; i < count; i++) {
                batchIds20[i] = id20;
            }
            geom.addAttribute('batchId20', new THREE.BufferAttribute(batchIds20, 1));
        }

        return new THREE.Line(geom, lineMaterial);
    }
}



const color = new THREE.Color();
const material = new THREE.MeshBasicMaterial();

function featureToPolygon(feature, options) {
    const ptsIn = feature.vertices;
    const normals = feature.normals;
    const vertices = new Float32Array(ptsIn.length);
    const colors = new Uint8Array(ptsIn.length);
    const indices = [];
    vertices.minAltitude = Infinity;

    const batchIds = options.batchId ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId = 0;
    const batchIds1 = options.batchId1 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId1 = 0;
    const batchIds2 = options.batchId2 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId2 = 0;
    const batchIds3 = options.batchId3 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId3 = 0;
    const batchIds4 = options.batchId4 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId4 = 0;
    const batchIds5 = options.batchId5 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId5 = 0;
    const batchIds6 = options.batchId6 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId6 = 0;
    const batchIds7 = options.batchId7 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId7 = 0;
    const batchIds8 = options.batchId8 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId8 = 0;
    const batchIds9 = options.batchId9 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId9 = 0;
    const batchIds10 = options.batchId10 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId10 = 0;
    const batchIds11 = options.batchId11 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId11 = 0;
    const batchIds12 = options.batchId12 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId12 = 0;
    const batchIds13 = options.batchId13 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId13 = 0;
    const batchIds14 = options.batchId14 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId14 = 0;
    const batchIds15 = options.batchId15 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId15 = 0;
    const batchIds16 = options.batchId16 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId16 = 0;
    const batchIds17 = options.batchId17 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId17 = 0;
    const batchIds18 = options.batchId18 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId18 = 0;
    const batchIds19 = options.batchId19 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId19 = 0;
    const batchIds20 = options.batchId20 ? new Uint32Array(vertices.length / 3) : undefined;
    let featureId20 = 0;

    for (const geometry of feature.geometry) {
        const altitude = getProperty('altitude', options, 0, geometry.properties);
        const color = getProperty('color', options, randomColor, geometry.properties);

        const start = geometry.indices[0].offset;
        // To avoid integer overflow with indice value (16 bits)
        if (start > 0xffff) {
            console.warn('Feature to Polygon: integer overflow, too many points in polygons');
            break;
        }

        const lastIndice = geometry.indices.slice(-1)[0];
        const end = lastIndice.offset + lastIndice.count;
        const count = end - start;

        coordinatesToVertices(ptsIn, normals, vertices, altitude, 0, start, count);
        fillColorArray(colors, count, color, start);

        const geomVertices = vertices.slice(start * 3, end * 3);
        const holesOffsets = geometry.indices.map(i => i.offset - start).slice(1);
        const triangles = Earcut(geomVertices, holesOffsets, 3);

        const startIndice = indices.length;
        indices.length += triangles.length;

        for (let i = 0; i < triangles.length; i++) {
            indices[startIndice + i] = triangles[i] + start;
        }

        if (batchIds) {
            const id = options.batchId(geometry.properties, featureId);
            for (let i = start; i < end; i++) {
                batchIds[i] = id;
            }
            featureId++;
        }
        if (batchIds1) {
            const id1 = options.batchId1(geometry.properties, featureId1);
            for (let i = start; i < end; i++) {
                batchIds1[i] = id1;
            }
            featureId1++;
        }
        if (batchIds2) {
            const id2 = options.batchId2(geometry.properties, featureId2);
            for (let i = start; i < end; i++) {
                batchIds2[i] = id2;
            }
            featureId2++;
        }
        if (batchIds3) {
            const id3 = options.batchId3(geometry.properties, featureId3);
            for (let i = start; i < end; i++) {
                batchIds3[i] = id3;
            }
            featureId3++;
        }
        if (batchIds4) {
            const id4 = options.batchId4(geometry.properties, featureId4);
            for (let i = start; i < end; i++) {
                batchIds4[i] = id4;
            }
            featureId4++;
        }
        if (batchIds5) {
            const id5 = options.batchId5(geometry.properties, featureId5);
            for (let i = start; i < end; i++) {
                batchIds5[i] = id5;
            }
            featureId5++;
        }
        if (batchIds6) {
            const id6 = options.batchId6(geometry.properties, featureId6);
            for (let i = start; i < end; i++) {
                batchIds6[i] = id6;
            }
            featureId6++;
        }
        if (batchIds7) {
            const id7 = options.batchId7(geometry.properties, featureId7);
            for (let i = start; i < end; i++) {
                batchIds7[i] = id7;
            }
            featureId7++;
        }
        if (batchIds8) {
            const id8 = options.batchId8(geometry.properties, featureId8);
            for (let i = start; i < end; i++) {
                batchIds8[i] = id8;
            }
            featureId8++;
        }
        if (batchIds9) {
            const id9 = options.batchId9(geometry.properties, featureId9);
            for (let i = start; i < end; i++) {
                batchIds9[i] = id9;
            }
            featureId9++;
        }
        if (batchIds10) {
            const id10 = options.batchId10(geometry.properties, featureId10);
            for (let i = start; i < end; i++) {
                batchIds10[i] = id10;
            }
            featureId10++;
        }
        if (batchIds11) {
            const id11 = options.batchId11(geometry.properties, featureId11);
            for (let i = start; i < end; i++) {
                batchIds11[i] = id11;
            }
            featureId11++;
        }
        if (batchIds12) {
            const id12 = options.batchId12(geometry.properties, featureId12);
            for (let i = start; i < end; i++) {
                batchIds12[i] = id12;
            }
            featureId12++;
        }
        if (batchIds13) {
            const id13 = options.batchId13(geometry.properties, featureId13);
            for (let i = start; i < end; i++) {
                batchIds13[i] = id13;
            }
            featureId13++;
        }
        if (batchIds14) {
            const id14 = options.batchId14(geometry.properties, featureId14);
            for (let i = start; i < end; i++) {
                batchIds14[i] = id14;
            }
            featureId14++;
        }
        if (batchIds15) {
            const id15 = options.batchId15(geometry.properties, featureId15);
            for (let i = start; i < end; i++) {
                batchIds15[i] = id15;
            }
            featureId15++;
        }
        if (batchIds16) {
            const id16 = options.batchId16(geometry.properties, featureId16);
            for (let i = start; i < end; i++) {
                batchIds16[i] = id16;
            }
            featureId16++;
        }
        if (batchIds17) {
            const id17 = options.batchId17(geometry.properties, featureId17);
            for (let i = start; i < end; i++) {
                batchIds17[i] = id17;
            }
            featureId17++;
        }
        if (batchIds18) {
            const id18 = options.batchId18(geometry.properties, featureId18);
            for (let i = start; i < end; i++) {
                batchIds18[i] = id18;
            }
            featureId18++;
        }
        if (batchIds19) {
            const id19 = options.batchId19(geometry.properties, featureId19);
            for (let i = start; i < end; i++) {
                batchIds19[i] = id19;
            }
            featureId19++;
        }
        if (batchIds20) {
            const id20 = options.batchId20(geometry.properties, featureId20);
            for (let i = start; i < end; i++) {
                batchIds20[i] = id20;
            }
            featureId20++;
        }
       
           
           
    }

    const geom = new THREE.BufferGeometry();
    geom.isBufferGeometry = true;
    geom.addAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geom.addAttribute('color', new THREE.BufferAttribute(colors, 3, true));
    if (batchIds) { geom.addAttribute('batchId', new THREE.BufferAttribute(batchIds, 1)); }
    if (batchIds1) { geom.addAttribute('batchId1', new THREE.BufferAttribute(batchIds1, 1)); }
    if (batchIds2) { geom.addAttribute('batchId2', new THREE.BufferAttribute(batchIds2, 1)); }
    if (batchIds3) { geom.addAttribute('batchId3', new THREE.BufferAttribute(batchIds3, 1)); }
    if (batchIds4) { geom.addAttribute('batchId4', new THREE.BufferAttribute(batchIds4, 1)); }
    if (batchIds5) { geom.addAttribute('batchId5', new THREE.BufferAttribute(batchIds5, 1)); }
    if (batchIds6) { geom.addAttribute('batchId6', new THREE.BufferAttribute(batchIds6, 1)); }
    if (batchIds7) { geom.addAttribute('batchId7', new THREE.BufferAttribute(batchIds7, 1)); }
    if (batchIds8) { geom.addAttribute('batchId8', new THREE.BufferAttribute(batchIds8, 1)); }
    if (batchIds9) { geom.addAttribute('batchId9', new THREE.BufferAttribute(batchIds9, 1)); }
    if (batchIds10) { geom.addAttribute('batchId10', new THREE.BufferAttribute(batchIds10, 1)); }
    if (batchIds11) { geom.addAttribute('batchId11', new THREE.BufferAttribute(batchIds11, 1)); }
    if (batchIds12) { geom.addAttribute('batchId12', new THREE.BufferAttribute(batchIds12, 1)); }
    if (batchIds13) { geom.addAttribute('batchId13', new THREE.BufferAttribute(batchIds13, 1)); }
    if (batchIds14) { geom.addAttribute('batchId14', new THREE.BufferAttribute(batchIds14, 1)); }
    if (batchIds15) { geom.addAttribute('batchId15', new THREE.BufferAttribute(batchIds15, 1)); }
    if (batchIds16) { geom.addAttribute('batchId16', new THREE.BufferAttribute(batchIds16, 1)); }
    if (batchIds17) { geom.addAttribute('batchId17', new THREE.BufferAttribute(batchIds17, 1)); }
    if (batchIds18) { geom.addAttribute('batchId18', new THREE.BufferAttribute(batchIds18, 1)); }
    if (batchIds19) { geom.addAttribute('batchId19', new THREE.BufferAttribute(batchIds19, 1)); }
    if (batchIds20) { geom.addAttribute('batchId20', new THREE.BufferAttribute(batchIds20, 1)); }

    geom.setIndex(new THREE.BufferAttribute(new Uint16Array(indices), 1));

    const mesh = new THREE.Mesh(geom, material);
    mesh.minAltitude = vertices.minAltitude;
    return mesh;
}

function area(contour, offset, count) {
    offset *= 3;
    const n = count * 3;
    let a = 0.0;

    for (let p = n + offset - 3, q = offset; q < n; p = q, q += 3) {
        a += contour[p] * contour[q + 1] - contour[q] * contour[p + 1];
    }

    return a * 0.5;
}




function featureToExtrudedPolygon(feature, options) {
    const ptsIn = feature.vertices;
    const offset = feature.geometry[0].indices[0].offset;
    const count = feature.geometry[0].indices[0].count;
    const isClockWise = area(ptsIn, offset, count) < 0;

    const normals = feature.normals;
    const vertices = new Float32Array(ptsIn.length * 2);
    const colors = new Uint8Array(ptsIn.length * 2);
    const indices = [];
    const totalVertices = ptsIn.length / 3;

    vertices.minAltitude = Infinity;

    // Alex mod to have 3 meshes with uvmap in degree: 1 for the roof, 1 for wall and 1 for edges
    var verticesRoofWithDup = [];
    var verticesWallsWithDup = [];
    var uvsRoofWithDup = [];
    var uvsWallsWithDup = [];
    var verticesEdges = [];
    var uvsEdges = [];
    var altitudeRoof = [];
    
    // var extrudeRoof = [];
     var altitudeEdges = [];
    var altitudeWalls = [];
    // var extrudeWalls = [];
    const attributeNames = options.attributes ? Object.keys(options.attributes) : [];
    for (const attributeName of attributeNames) {
        const attribute = options.attributes[attributeName];
        attribute.normalized = attribute.normalized || false;
        attribute.itemSize = attribute.itemSize || 1;
        attribute.array = new (attribute.type)(2 * totalVertices * attribute.itemSize);
    }

    const batchIds = options.batchId ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds1 = options.batchId1 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds2 = options.batchId2 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds3 = options.batchId3 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds4 = options.batchId4 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds5 = options.batchId5 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds6 = options.batchId6 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds7 = options.batchId7 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds8 = options.batchId8 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds9 = options.batchId9 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds10 = options.batchId10 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds11 = options.batchId11 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds12 = options.batchId12 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds13 = options.batchId13 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds14 = options.batchId14 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds15 = options.batchId15 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds16 = options.batchId16 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds17 = options.batchId17 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds18 = options.batchId18 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds19 = options.batchId19 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIds20 = options.batchId20 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls = options.batchId ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls1 = options.batchId1 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls2 = options.batchId2 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls3 = options.batchId3 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls4 = options.batchId4 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls5 = options.batchId5 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls6 = options.batchId6 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls7 = options.batchId7 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls8 = options.batchId8 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls9 = options.batchId9 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls10 = options.batchId10 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls11 = options.batchId11 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls12 = options.batchId12 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls13 = options.batchId13 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls14 = options.batchId14 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls15 = options.batchId15 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls16 = options.batchId16 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls17 = options.batchId17 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls18 = options.batchId18 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls19 = options.batchId19 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    const batchIdsWalls20 = options.batchId20 ?  [] /* new Uint32Array(vertices.length / 3) */ : undefined;
    let featureId = 0;
    let id;
    let featureId1 = 0;
    let id1;
    let featureId2 = 0;
    let id2;
    let featureId3 = 0;
    let id3;
    let featureId4 = 0;
    let id4;
    let featureId5 = 0;
    let id5;
    let featureId6 = 0;
    let id6;
    let featureId7 = 0;
    let id7;
    let featureId8 = 0;
    let id8;
    let featureId9 = 0;
    let id9;
    let featureId10 = 0;
    let id10;
    let featureId11 = 0;
    let id11;
    let featureId12 = 0;
    let id12;
    let featureId13 = 0;
    let id13;
    let featureId14 = 0;
    let id14;
    let featureId15 = 0;
    let id15;
    let featureId16 = 0;
    let id16;
    let featureId17 = 0;
    let id17;
    let featureId18 = 0;
    let id18;
    let featureId19 = 0;
    let id19;
    let featureId20 = 0;
    let id20;

    for (const geometry of feature.geometry) {
        // console.log(geometry.properties);
        const altitude = getProperty('altitude', options, 0, geometry.properties);
        const extrude = getProperty('extrude', options, 0, geometry.properties);

        const colorTop = getProperty('color', options, randomColor, geometry.properties);
        color.copy(colorTop);
        color.multiplyScalar(0.6);

        const start = geometry.indices[0].offset;
        const lastIndice = geometry.indices.slice(-1)[0];
        const end = lastIndice.offset + lastIndice.count;
        const count = end - start;

        coordinatesToVertices(ptsIn, normals, vertices, altitude, 0, start, count);
        fillColorArray(colors, count, color, start);

        const startTop = start + totalVertices;
        const endTop = end + totalVertices;
        coordinatesToVertices(ptsIn, normals, vertices, altitude,extrude, startTop, count, start);
        fillColorArray(colors, count, colorTop, startTop);

        const geomVertices = vertices.slice(startTop * 3, endTop * 3);
        const holesOffsets = geometry.indices.map(i => i.offset - start).slice(1);
        const triangles = Earcut(geomVertices, holesOffsets, 3);

        const startIndice = indices.length;
        indices.length += triangles.length;

        if (batchIds) {
            id = options.batchId(geometry.properties, featureId);
        }
        if (batchIds1) {
            id1 = options.batchId1(geometry.properties, featureId1);
        }
        if (batchIds2) {
            id2 = options.batchId2(geometry.properties, featureId2);
        }
        if (batchIds3) {
            id3 = options.batchId3(geometry.properties, featureId3);
        }
        if (batchIds4) {
            id4 = options.batchId4(geometry.properties, featureId4);
        }
        if (batchIds5) {
            id5 = options.batchId5(geometry.properties, featureId5);
        }
        if (batchIds6) {
            id6 = options.batchId6(geometry.properties, featureId6);
        }
        if (batchIds7) {
            id7 = options.batchId7(geometry.properties, featureId7);
        }
        if (batchIds8) {
            id8 = options.batchId8(geometry.properties, featureId8);
        }
        if (batchIds9) {
            id9 = options.batchId9(geometry.properties, featureId9);
        }
        if (batchIds10) {
            id10 = options.batchId10(geometry.properties, featureId10);
        }
        if (batchIds11) {
            id11 = options.batchId11(geometry.properties, featureId11);
        }
        if (batchIds12) {
            id12 = options.batchId12(geometry.properties, featureId12);
        }
        if (batchIds13) {
            id13 = options.batchId13(geometry.properties, featureId13);
        }
        if (batchIds14) {
            id14 = options.batchId14(geometry.properties, featureId14);
        }
        if (batchIds15) {
            id15 = options.batchId15(geometry.properties, featureId15);
        }
        if (batchIds16) {
            id16 = options.batchId16(geometry.properties, featureId16);
        }
        if (batchIds17) {
            id17 = options.batchId17(geometry.properties, featureId17);
        }
        if (batchIds18) {
            id18 = options.batchId18(geometry.properties, featureId18);
        }
        if (batchIds19) {
            id19 = options.batchId19(geometry.properties, featureId19);
        }
        if (batchIds20) {
            id20 = options.batchId20(geometry.properties, featureId20);
        }

        for (let i = 0; i < triangles.length; i++) {
            indices[startIndice + i] = triangles[i] + startTop;
            verticesRoofWithDup.push(geomVertices[triangles[i] * 3 + 0]);
            verticesRoofWithDup.push(geomVertices[triangles[i] * 3 + 1]);
            verticesRoofWithDup.push(geomVertices[triangles[i] * 3 + 2]);

            var posWGS = new THREE.Vector3(geomVertices[triangles[i] * 3 + 0], geomVertices[triangles[i] * 3 + 1], geomVertices[triangles[i] * 3 + 2]);
            var c = new Coordinates('EPSG:4978', posWGS.x, posWGS.y, posWGS.z).as('EPSG:4326'); // Geocentric coordinates
            // uvsRoofWithDup.push((c._values[0]), (c._values[1]));
            uvsRoofWithDup.push(c.latitude, c.longitude);
            altitudeRoof.push(altitude);
            // extrudeRoof.push(extrude);

            // BatchIDS new
            if (batchIds) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds.push(id);
            }
            if (batchIds1) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds1.push(id1);
            }
            if (batchIds2) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds2.push(id2);
            }
            if (batchIds3) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds3.push(id3);
            }
            if (batchIds4) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds4.push(id4);
            }
            if (batchIds5) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds5.push(id5);
            }
            if (batchIds6) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds6.push(id6);
            }
            if (batchIds7) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds7.push(id7);
            }
            if (batchIds8) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds8.push(id8);
            }
            if (batchIds9) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds9.push(id9);
            }
            if (batchIds10) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds10.push(id10);
            }
            if (batchIds11) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds11.push(id11);
            }
            if (batchIds12) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds12.push(id12);
            }
            if (batchIds13) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds13.push(id13);
            }
            if (batchIds14) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds14.push(id14);
            }
            if (batchIds15) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds15.push(id15);
            }
            if (batchIds16) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds16.push(id16);
            }
            if (batchIds17) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds17.push(id17);
            }
            if (batchIds18) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds18.push(id18);
            }
            if (batchIds19) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds19.push(id19);
            }
            if (batchIds20) {
                // const id = options.batchId(geometry.properties, featureId);
                batchIds20.push(id20);
            }
        }

        var l0 = verticesWallsWithDup.length;

        for (const indice of geometry.indices) {
            addExtrudedPolygonSideFacesWithDup(
                verticesEdges,
                uvsEdges,
                uvsWallsWithDup,
                verticesWallsWithDup,
                vertices,
                indices,
                totalVertices,
                indice.offset,
                indice.count,
                isClockWise,
            );
        }

        var l = (verticesWallsWithDup.length - l0) / 3; // We added n trianges  = l / 3  (3 for x,y,z)
        // BatchIDS new
        if (batchIdsWalls) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls.push(id);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds) {
            featureId++;
        }
        if (batchIdsWalls1) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls1.push(id1);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds1) {
            featureId1++;
        }
        if (batchIdsWalls2) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls2.push(id2);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds2) {
            featureId2++;
        }
        if (batchIdsWalls3) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls3.push(id3);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds3) {
            featureId3++;
        }
        if (batchIdsWalls4) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls4.push(id4);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds4) {
            featureId4++;
        }
        if (batchIdsWalls5) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls5.push(id5);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds5) {
            featureId5++;
        }
        if (batchIdsWalls6) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls6.push(id6);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds6) {
            featureId6++;
        }
        if (batchIdsWalls7) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls7.push(id7);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds7) {
            featureId7++;
        }
        if (batchIdsWalls8) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls8.push(id8);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds8) {
            featureId8++;
        }
        if (batchIdsWalls9) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls9.push(id9);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds9) {
            featureId9++;
        }
        if (batchIdsWalls10) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls10.push(id10);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds10) {
            featureId10++;
        }
        if (batchIdsWalls11) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls11.push(id11);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds11) {
            featureId11++;
        }
        if (batchIdsWalls12) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls12.push(id12);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds12) {
            featureId12++;
        }
        if (batchIdsWalls13) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls13.push(id13);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds13) {
            featureId13++;
        }
        if (batchIdsWalls14) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls14.push(id14);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds14) {
            featureId14++;
        }
        if (batchIdsWalls15) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls15.push(id15);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds15) {
            featureId15++;
        }
        if (batchIdsWalls16) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls16.push(id16);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds16) {
            featureId16++;
        }
        if (batchIdsWalls17) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls17.push(id17);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds17) {
            featureId17++;
        }
        if (batchIdsWalls18) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls18.push(id18);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds18) {
            featureId18++;
        }
        if (batchIdsWalls19) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls19.push(id19);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds19) {
            featureId19++;
        }
        if (batchIdsWalls20) {
            for (var h = 0; h < l; h++) {
                batchIdsWalls20.push(id20);
                altitudeWalls.push(altitude);
                // extrudeWalls.push(extrude);
            }
        }
        if (batchIds20) {
            featureId20++;
        }

    }

    // Shader test for roof
    function createMaterial(vShader, fShader) {
        const uniforms = {
            waterLevel: { type: 'f', value: 0.0 },
            opacity: { type: 'f', value: 1.0 },
            z0: { type: 'f', value: 0.0 },
            z1: { type: 'f', value: 2.0 },
            // color0: {type: 'c', value: new THREE.Color(0x888888)},
            color0: { type: 'c', value: new THREE.Color(0x006600) },
            color1: { type: 'c', value: new THREE.Color(0xbb0000) },
            // color1: {type: 'c', value: new THREE.Color(0x4444ff)},
        };

        const meshMaterial = new THREE.ShaderMaterial({
            // uniforms: uniforms,
            uniforms,
            vertexShader: vShader,
            fragmentShader: fShader,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide,
        });
        return meshMaterial;
    }

    const vertexShader = `
    
    #include <common>
    #include <logdepthbuf_pars_vertex>

    uniform float waterLevel;
    uniform float opacity;
    uniform vec3 color0;
    uniform vec3 color1;
    uniform float z0;
    uniform float z1;

    varying vec2 vUv;

    void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
    }
    `;

    const fragmentShader = `
    #include <common>
    #include <logdepthbuf_pars_fragment>
    varying vec2 vUv;
   
   
    void main(){
        #include <logdepthbuf_fragment>
       


        vec2 normUV = vec2(mod(vUv.x * 10000., 1.), mod(vUv.y * 10000., 1.));
        gl_FragColor = vec4(normUV.x, normUV.y, 0., 1.);
    }
    `;

    const shadMat = createMaterial(vertexShader, fragmentShader);
   
    // WALLS
    const geom = new THREE.BufferGeometry();
    geom.isBufferGeometry = true;
    geom.addAttribute('position', new THREE.BufferAttribute(new Float32Array(verticesWallsWithDup), 3));
    geom.addAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvsWallsWithDup), 2));
    geom.addAttribute('zbottom', new THREE.BufferAttribute(new Float32Array(altitudeWalls), 1));

    if (batchIdsWalls) { geom.addAttribute('batchId', new THREE.BufferAttribute(new Float32Array(batchIdsWalls), 1)); }
    if (batchIdsWalls1) { geom.addAttribute('batchId1', new THREE.BufferAttribute(new Float32Array(batchIdsWalls1), 1)); }
    if (batchIdsWalls2) { geom.addAttribute('batchId2', new THREE.BufferAttribute(new Float32Array(batchIdsWalls2), 1)); }
    if (batchIdsWalls3) { geom.addAttribute('batchId3', new THREE.BufferAttribute(new Float32Array(batchIdsWalls3), 1)); }
    if (batchIdsWalls4) { geom.addAttribute('batchId4', new THREE.BufferAttribute(new Float32Array(batchIdsWalls4), 1)); }
    if (batchIdsWalls5) { geom.addAttribute('batchId5', new THREE.BufferAttribute(new Float32Array(batchIdsWalls5), 1)); }
    if (batchIdsWalls6) { geom.addAttribute('batchId6', new THREE.BufferAttribute(new Float32Array(batchIdsWalls6), 1)); }
    if (batchIdsWalls7) { geom.addAttribute('batchId7', new THREE.BufferAttribute(new Float32Array(batchIdsWalls7), 1)); }
    if (batchIdsWalls8) { geom.addAttribute('batchId8', new THREE.BufferAttribute(new Float32Array(batchIdsWalls8), 1)); }
    if (batchIdsWalls9) { geom.addAttribute('batchId9', new THREE.BufferAttribute(new Float32Array(batchIdsWalls9), 1)); }
    if (batchIdsWalls10) { geom.addAttribute('batchId10', new THREE.BufferAttribute(new Float32Array(batchIdsWalls10), 1)); }
    if (batchIdsWalls11) { geom.addAttribute('batchId11', new THREE.BufferAttribute(new Float32Array(batchIdsWalls11), 1)); }
    if (batchIdsWalls12) { geom.addAttribute('batchId12', new THREE.BufferAttribute(new Float32Array(batchIdsWalls12), 1)); }
    if (batchIdsWalls13) { geom.addAttribute('batchId13', new THREE.BufferAttribute(new Float32Array(batchIdsWalls13), 1)); }
    if (batchIdsWalls14) { geom.addAttribute('batchId14', new THREE.BufferAttribute(new Float32Array(batchIdsWalls14), 1)); }
    if (batchIdsWalls15) { geom.addAttribute('batchId15', new THREE.BufferAttribute(new Float32Array(batchIdsWalls15), 1)); }
    if (batchIdsWalls16) { geom.addAttribute('batchId16', new THREE.BufferAttribute(new Float32Array(batchIdsWalls16), 1)); }
    if (batchIdsWalls17) { geom.addAttribute('batchId17', new THREE.BufferAttribute(new Float32Array(batchIdsWalls17), 1)); }
    if (batchIdsWalls18) { geom.addAttribute('batchId18', new THREE.BufferAttribute(new Float32Array(batchIdsWalls18), 1)); }
    if (batchIdsWalls19) { geom.addAttribute('batchId19', new THREE.BufferAttribute(new Float32Array(batchIdsWalls19), 1)); }
    if (batchIdsWalls20) { geom.addAttribute('batchId20', new THREE.BufferAttribute(new Float32Array(batchIdsWalls20), 1)); }
    geom.computeVertexNormals();
    var mat = new THREE.MeshBasicMaterial({ /* map: texture */  color: new THREE.Color(Math.random() * 0xffff00),  wireframe: true });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.minAltitude = vertices.minAltitude;
    // ROOF
    const geomRoof = new THREE.BufferGeometry();
    geomRoof.addAttribute('position', new THREE.BufferAttribute(new Float32Array(verticesRoofWithDup), 3));
    geomRoof.addAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvsRoofWithDup), 2));
    geomRoof.addAttribute('zbottom', new THREE.BufferAttribute(new Float32Array(altitudeRoof), 1));

    if (batchIds) { geomRoof.addAttribute('batchId', new THREE.BufferAttribute(new Float32Array(batchIds), 1)); }
    if (batchIds1) { geomRoof.addAttribute('batchId1', new THREE.BufferAttribute(new Float32Array(batchIds1), 1)); }
    if (batchIds2) { geomRoof.addAttribute('batchId2', new THREE.BufferAttribute(new Float32Array(batchIds2), 1)); }
    if (batchIds3) { geomRoof.addAttribute('batchId3', new THREE.BufferAttribute(new Float32Array(batchIds3), 1)); }
    if (batchIds4) { geomRoof.addAttribute('batchId4', new THREE.BufferAttribute(new Float32Array(batchIds4), 1)); }
    if (batchIds5) { geomRoof.addAttribute('batchId5', new THREE.BufferAttribute(new Float32Array(batchIds5), 1)); }
    if (batchIds6) { geomRoof.addAttribute('batchId6', new THREE.BufferAttribute(new Float32Array(batchIds6), 1)); }
    if (batchIds7) { geomRoof.addAttribute('batchId7', new THREE.BufferAttribute(new Float32Array(batchIds7), 1)); }
    if (batchIds8) { geomRoof.addAttribute('batchId8', new THREE.BufferAttribute(new Float32Array(batchIds8), 1)); }
    if (batchIds9) { geomRoof.addAttribute('batchId9', new THREE.BufferAttribute(new Float32Array(batchIds9), 1)); }
    if (batchIds10) { geomRoof.addAttribute('batchId10', new THREE.BufferAttribute(new Float32Array(batchIds10), 1)); }
    if (batchIds11) { geomRoof.addAttribute('batchId11', new THREE.BufferAttribute(new Float32Array(batchIds11), 1)); }
    if (batchIds12) { geomRoof.addAttribute('batchId12', new THREE.BufferAttribute(new Float32Array(batchIds12), 1)); }
    if (batchIds13) { geomRoof.addAttribute('batchId13', new THREE.BufferAttribute(new Float32Array(batchIds13), 1)); }
    if (batchIds14) { geomRoof.addAttribute('batchId14', new THREE.BufferAttribute(new Float32Array(batchIds14), 1)); }
    if (batchIds15) { geomRoof.addAttribute('batchId15', new THREE.BufferAttribute(new Float32Array(batchIds15), 1)); }
    if (batchIds16) { geomRoof.addAttribute('batchId16', new THREE.BufferAttribute(new Float32Array(batchIds16), 1)); }
    if (batchIds17) { geomRoof.addAttribute('batchId17', new THREE.BufferAttribute(new Float32Array(batchIds17), 1)); }
    if (batchIds18) { geomRoof.addAttribute('batchId18', new THREE.BufferAttribute(new Float32Array(batchIds18), 1)); }
    if (batchIds19) { geomRoof.addAttribute('batchId19', new THREE.BufferAttribute(new Float32Array(batchIds19), 1)); }
    if (batchIds20) { geomRoof.addAttribute('batchId20', new THREE.BufferAttribute(new Float32Array(batchIds20), 1)); }
    geomRoof.computeVertexNormals();
    // var textureRoof = new THREE.TextureLoader().load('./textures/slatetile.jpg');
    // var matRoof = new THREE.MeshBasicMaterial({ /* map: textureRoof, */  color: new THREE.Color(Math.random() * 0xffff00), wireframe: true });
    const meshRoof = new THREE.Mesh(geomRoof, shadMat); // matRoof 

    meshRoof.minAltitude = vertices.minAltitude;

    // EDGES
     const geomEdges = new THREE.BufferGeometry();
    // console.log(verticesEdges);
     geomEdges.addAttribute('position', new THREE.BufferAttribute(new Float32Array(verticesEdges), 3));

    // if (batchIds) { geomEdges.addAttribute('batchId', new THREE.BufferAttribute(batchIds, 1)); }
    // geomEdges.addAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvsEdges)/*vertices*/, 2));
    // var textureEdges = new THREE.TextureLoader().load('./textures/slatetile.jpg');
    var matEdges = new THREE.LineBasicMaterial({ /* map:textureEdges, */ color: new THREE.Color(Math.random() * 0xffff00)  });
    const meshEdges = new THREE.LineSegments(geomEdges, matEdges);
    meshEdges.minAltitude = vertices.minAltitude;


    var meshGroup = new THREE.Group();
    meshGroup.add(mesh);
    meshGroup.add(meshRoof);
    meshGroup.add(meshEdges);

    // console.log('meshGroup: ', meshGroup);
    return  meshGroup; // mesh;
}



/**
 * Convert a [Feature]{@link Feature#geometry}'s geometry to a Mesh
 *
 * @param {Object} feature - a Feature's geometry
 * @param {Object} options - options controlling the conversion
 * @param {number|function} options.altitude - define the base altitude of the mesh
 * @param {number|function} options.extrude - if defined, polygons will be extruded by the specified amount
 * @param {object|function} options.color - define per feature color
 * @return {THREE.Mesh} mesh
 */
function featureToMesh(feature, options) {
    if (!feature.vertices) {
        return;
    }

    var mesh;
    switch (feature.type) {
        case FEATURE_TYPES.POINT:
            mesh = featureToPoint(feature, options);
            break;
        case FEATURE_TYPES.LINE:
            mesh = featureToLine(feature, options);
            break;
        case FEATURE_TYPES.POLYGON:
            if (options.extrude) {
                mesh = featureToExtrudedPolygon(feature, options);
            } else {
                mesh = featureToPolygon(feature, options);
            }
            break;
        default:
    }

    // set mesh material
    if (mesh.isGroup) {
        mesh.children.forEach((child) => {
            // child.material.vertexColors = THREE.VertexColors;
            // child.material.color = new THREE.Color(0xffffff);
            child.feature = feature;
        });
    } else {
        mesh.material.vertexColors = THREE.VertexColors;
        mesh.material.color = new THREE.Color(0xffffff);
        mesh.feature = feature;
    }

    return mesh;
}

function featuresToThree(features, options) {
    if (!features || features.length == 0) { return; }

    if (features.length == 1) {
        coord.crs = features[0].crs;
        coord.setFromValues(0, 0, 0);
        return featureToMesh(features[0], options);
    }

    const group = new THREE.Group();
    group.minAltitude = Infinity;

    for (const feature of features) {
        coord.crs = feature.crs;
        coord.setFromValues(0, 0, 0);
        const mesh = featureToMesh(feature, options);
        group.add(mesh);
        group.minAltitude = Math.min(mesh.minAltitude, group.minAltitude);
    }

    return group;
}




/**
 * @module Feature2Mesh
 */
export default {
    /**
     * Return a function that converts [Features]{@link module:GeoJsonParser} to Meshes. Feature collection will be converted to a
     * a THREE.Group.
     *
     * @param {Object} options - options controlling the conversion
     * @param {number|function} options.altitude - define the base altitude of the mesh
     * @param {number|function} options.extrude - if defined, polygons will be extruded by the specified amount
     * @param {object|function} options.color - define per feature color
     * @param {function} [options.batchId] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId1] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId2] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId3] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId4] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId5] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId6] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId7] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId8] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId9] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId10] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId11] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId12] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId13] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId14] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId15] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId16] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId17] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId18] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId19] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @param {function} [options.batchId20] - optional function to create batchId attribute. It is passed the feature property and the feature index. As the batchId is using an unsigned int structure on 32 bits, the batchId could be between 0 and 4,294,967,295.
     * @return {function}
     * @example <caption>Example usage of batchId with featureId.</caption>
     * view.addLayer({
     *     id: 'WFS Buildings',
     *     type: 'geometry',
     *     update: itowns.FeatureProcessing.update,
     *     convert: itowns.Feature2Mesh.convert({
     *         color: colorBuildings,
     *         batchId: (property, featureId) => featureId,
     *         altitude: altitudeBuildings,
     *         extrude: extrudeBuildings }),
     *     onMeshCreated: function scaleZ(mesh) {
     *         mesh.scale.z = 0.01;
     *         meshes.push(mesh);
     *     },
     *     filter: acceptFeature,
     *     source,
     * });
     *
     * @example <caption>Example usage of batchId with property.</caption>
     * view.addLayer({
     *     id: 'WFS Buildings',
     *     type: 'geometry',
     *     update: itowns.FeatureProcessing.update,
     *     convert: itowns.Feature2Mesh.convert({
     *         color: colorBuildings,
     *         batchId: (property, featureId) => property.house ? 10 : featureId,
     *         altitude: altitudeBuildings,
     *         extrude: extrudeBuildings }),
     *     onMeshCreated: function scaleZ(mesh) {
     *         mesh.scale.z = 0.01;
     *         meshes.push(mesh);
     *     },
     *     filter: acceptFeature,
     *     source,
     * });
     */
    convert(options = {}) {
        return function _convert(collection) {
            if (!collection) { return; }

            return featuresToThree(collection.features, options);
        };
    },
};








