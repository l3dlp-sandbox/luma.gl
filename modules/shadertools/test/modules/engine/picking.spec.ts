// luma.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import test from 'tape-promise/tape';
import {getWebGLTestDevice} from '@luma.gl/test-utils';

import {BufferTransform} from '@luma.gl/engine';
import {picking, getShaderModuleUniforms} from '@luma.gl/shadertools';
import {UniformValue} from '@luma.gl/core';

const TEST_DATA = {
  vertexColorData: new Float32Array([
    0,
    0,
    0,
    255,
    100,
    150,
    50,
    50,
    50,
    251,
    103,
    153, // is picked only when threshold is 5
    150,
    100,
    255,
    254.5,
    100,
    150, // is picked with default threshold (1)
    100,
    150,
    255,
    255,
    255,
    255,
    255,
    100,
    149.5 // // is picked with default threshold (1)
  ])
};

const TEST_CASES = [
  {
    highlightedObjectColor: null,
    isPicked: [0, 0, 0, 0, 0, 0, 0, 0, 0]
  },
  {
    highlightedObjectColor: [255, 255, 255] as [number, number, number],
    isPicked: [0, 0, 0, 0, 0, 0, 0, 1, 0]
  },
  {
    highlightedObjectColor: [255, 100, 150] as [number, number, number],
    isPicked: [0, 1, 0, 0, 0, 0, 0, 0, 0]
  }
];

test('picking#getUniforms', async t => {
  t.deepEqual(getShaderModuleUniforms(picking, {}, {}), {}, 'Empty input');

  t.deepEqual(
    picking.getUniforms({
      isActive: true,
      highlightedObjectColor: undefined,
      highlightColor: [255, 0, 0]
    }),
    {
      isActive: true,
      isAttribute: false,
      highlightColor: [1, 0, 0, 1]
    },
    'Undefined input (no change to highlighted object)'
  );

  t.deepEqual(
    picking.getUniforms({
      isActive: true,
      highlightedObjectColor: null,
      highlightColor: [255, 0, 0]
    }),
    {
      isActive: true,
      isAttribute: false,
      isHighlightActive: false,
      highlightColor: [1, 0, 0, 1]
    },
    'Null input (clear highlighted object)'
  );

  t.deepEqual(
    picking.getUniforms({
      highlightedObjectColor: [0, 0, 1],
      highlightColor: [102, 0, 0, 51]
    }),
    {
      isHighlightActive: true,
      highlightedObjectColor: [0, 0, 1],
      highlightColor: [0.4, 0, 0, 0.2]
    },
    'Picked input (set highlighted object)'
  );

  t.deepEqual(
    picking.getUniforms({
      highlightedObjectColor: [0, 0, 1],
      highlightColor: [102, 0, 0, 51],
      useFloatColors: false
    }),
    {
      useFloatColors: false,
      isHighlightActive: true,
      highlightedObjectColor: [0, 0, 1],
      highlightColor: [0.4, 0, 0, 0.2]
    },
    'Override useFloatColors'
  );

  t.end();
});

// TODO(v9): Restore picking tests.
test.skip('picking#isVertexPicked(highlightedObjectColor invalid)', async t => {
  const device = await getWebGLTestDevice();

  if (!BufferTransform.isSupported(device)) {
    t.comment('Transform not available, skipping tests');
    t.end();
    return;
  }

  const VS = `\
  in vec3 vertexColor;
  out float isPicked;

  void main()
  {
    isPicked = float(isVertexPicked(vertexColor));
  }
  `;
  const vertexColorData = TEST_DATA.vertexColorData;

  const vertexCount = vertexColorData.length / 3;
  const vertexColor = device.createBuffer(vertexColorData);
  const isPicked = device.createBuffer({byteLength: vertexCount * 4});

  const transform = new BufferTransform(device, {
    // @ts-expect-error
    sourceBuffers: {
      vertexColor
    },
    feedbackBuffers: {
      isPicked
    },
    vs: VS,
    varyings: ['isPicked'],
    modules: [picking],
    vertexCount
  });

  await Promise.all(
    TEST_CASES.map(async testCase => {
      // @ts-expect-error
      const uniforms = module.getUniforms({
        highlightedObjectColor: testCase.highlightedObjectColor
      });

      // @ts-ignore
      transform.model.setUniforms(uniforms);
      transform.run();

      const expectedData = testCase.isPicked;
      const outData = await transform.readAsync('isPicked');

      t.deepEqual(outData, expectedData, 'Vertex should correctly get picked');
    })
  );

  t.end();
});

// TODO(v9): Restore picking tests.
/* eslint-disable max-nested-callbacks */
test.skip('picking#picking_setPickingColor', async t => {
  const device = await getWebGLTestDevice();

  if (!BufferTransform.isSupported(device)) {
    t.comment('Transform not available, skipping tests');
    t.end();
    return;
  }
  const VS = `\
  in vec3 vertexColor;
  out float rgbColorASelected;

  void main()
  {
    picking_setPickingColor(vertexColor);
    rgbColorASelected = picking_vRGBcolor_Avalid.a;
  }
  `;

  const vertexColorData = TEST_DATA.vertexColorData;

  const vertexCount = vertexColorData.length / 3;
  const vertexColor = device.createBuffer(vertexColorData);
  const rgbColorASelected = device.createBuffer({byteLength: vertexCount * 4});

  const transform = new BufferTransform(device, {
    vs: VS,
    bufferLayout: [{name: 'vertexColor', format: 'float32'}],
    outputs: ['rgbColorASelected'],
    modules: [picking],
    vertexCount,
    attributes: {vertexColor},
    feedbackBuffers: {rgbColorASelected}
  });

  await Promise.all(
    TEST_CASES.map(async testCase => {
      const uniforms = getShaderModuleUniforms(
        picking,
        {
          highlightedObjectColor: testCase.highlightedObjectColor,
          // @ts-expect-error
          pickingThreshold: testCase.pickingThreshold
        },
        {}
      ) as Record<string, UniformValue>;

      // @ts-ignore
      transform.model.setUniforms(uniforms);
      transform.run();

      const outData = await transform.readAsync('rgbColorASelected');

      t.deepEqual(outData, testCase.isPicked, 'Vertex should correctly get picked');
    })
  );
  t.ok(true, 'picking_setPickingColor successful');

  t.end();
});
/* eslint-enable max-nested-callbacks */
