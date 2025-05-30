// luma.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import type {NumberArray, VariableShaderType} from '@luma.gl/core';
import {Texture, UniformStore} from '@luma.gl/core';
import type {AnimationProps} from '@luma.gl/engine';
import {
  AnimationLoopTemplate,
  Model,
  CubeGeometry,
  loadImageBitmap,
  AsyncTexture
} from '@luma.gl/engine';
import {Matrix4} from '@math.gl/core';

export const title = 'Rotating Cube';
export const description = 'Shows rendering a basic triangle.';

const WGSL_SHADER = /* WGSL */ `\
struct Uniforms {
  modelViewProjectionMatrix : mat4x4<f32>,
};

@group(0) @binding(0) var<uniform> app : Uniforms;
@group(0) @binding(1) var uTexture : texture_2d<f32>;
@group(0) @binding(2) var uTextureSampler : sampler;

struct VertexInputs {
  // CUBE GEOMETRY
  @location(0) positions : vec4<f32>,
  @location(1) texCoords : vec2<f32>
};

struct FragmentInputs {
  @builtin(position) Position : vec4<f32>,
  @location(0) fragUV : vec2<f32>,
  @location(1) fragPosition: vec4<f32>,
}

@vertex
fn vertexMain(inputs: VertexInputs) -> FragmentInputs {
  var outputs : FragmentInputs;
  outputs.Position = app.modelViewProjectionMatrix * inputs.positions;
  outputs.fragUV = inputs.texCoords;
  outputs.fragPosition = 0.5 * (inputs.positions + vec4(1.0, 1.0, 1.0, 1.0));
  return outputs;
}

@fragment
fn fragmentMain(inputs: FragmentInputs) -> @location(0) vec4<f32> {
  // return inputs.fragPosition;
  return textureSample(uTexture, uTextureSampler, inputs.fragUV);
}
`;

// GLSL

export const VS_GLSL = /* glsl */ `\
#version 300 es
#define SHADER_NAME cube-vs

uniform appUniforms {
  mat4 modelViewProjectionMatrix;
} app;

layout(location=0) in vec3 positions;
layout(location=1) in vec2 texCoords;

out vec2 fragUV;
out vec4 fragPosition;

void main() {
  gl_Position = app.modelViewProjectionMatrix * vec4(positions, 1.0);
  fragUV = texCoords;
  fragPosition = 0.5 * (vec4(positions, 1.) + vec4(1., 1., 1., 1.));
}
`;

export const FS_GLSL = /* glsl */ `\
#version 300 es
#define SHADER_NAME cube-fs
precision highp float;

uniform sampler2D uTexture;

uniform appUniforms {
  mat4 modelViewProjectionMatrix;
} app;

in vec2 fragUV;
in vec4 fragPosition;

layout (location=0) out vec4 fragColor;

void main() {
  fragColor = fragPosition;
  fragColor = texture(uTexture, vec2(fragUV.x, 1.0 - fragUV.y));
}
`;

type AppUniforms = {
  mvpMatrix: NumberArray;
};

const app: {uniformTypes: Record<keyof AppUniforms, VariableShaderType>} = {
  uniformTypes: {
    mvpMatrix: 'mat4x4<f32>'
  }
};

const eyePosition = [0, 0, -4];

export default class AppAnimationLoopTemplate extends AnimationLoopTemplate {
  static info = `\
<p>
Drawing a textured cube
</p>

<p>
Rendered using the luma.gl <code>Model</code>, <code>CubeGeometry</code> and <code>AnimationLoop</code> classes.
</p>
`;

  mvpMatrix = new Matrix4();
  viewMatrix = new Matrix4().lookAt({eye: eyePosition});
  model: Model;

  uniformStore = new UniformStore<{app: AppUniforms}>({app});

  constructor({device}: AnimationProps) {
    super();

    const texture = new AsyncTexture(device, {
      usage: Texture.TEXTURE | Texture.RENDER_ATTACHMENT | Texture.COPY_DST,
      data: loadImageBitmap('vis-logo.png'),
      flipY: true,
      mipmaps: true,
      sampler: device.createSampler({
        minFilter: 'linear',
        magFilter: 'linear',
        mipmapFilter: 'linear'
      })
    });

    this.model = new Model(device, {
      id: 'rotating-cube',
      source: WGSL_SHADER,
      vs: VS_GLSL,
      fs: FS_GLSL,
      geometry: new CubeGeometry({indices: false}),
      bindings: {
        app: this.uniformStore.getManagedUniformBuffer(device, 'app'),
        uTexture: texture
        // uTextureSampler: texture.sampler
      },
      parameters: {
        depthWriteEnabled: true,
        depthCompare: 'less-equal'
      }
    });
  }

  onFinalize() {
    this.model.destroy();
    this.uniformStore.destroy();
  }

  onRender({device, aspect, tick}: AnimationProps) {
    this.mvpMatrix
      .perspective({fovy: Math.PI / 3, aspect})
      .multiplyRight(this.viewMatrix)
      .rotateX(tick * 0.01)
      .rotateY(tick * 0.013);

    this.uniformStore.setUniforms({
      app: {mvpMatrix: this.mvpMatrix}
    });

    // const framebuffer = device.getDefaultCanvasContext().getCurrentFramebuffer();
    const renderPass = device.beginRenderPass({clearColor: [0, 0, 0, 1], clearDepth: 1});
    this.model.draw(renderPass);
    renderPass.end();
  }
}
