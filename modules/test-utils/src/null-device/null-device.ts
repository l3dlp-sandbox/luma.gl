// luma.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import type {
  DeviceProps,
  CanvasContextProps,
  VertexArray,
  VertexArrayProps,
  BufferProps,
  ShaderProps,
  SamplerProps,
  TextureProps,
  ExternalTexture,
  ExternalTextureProps,
  FramebufferProps,
  RenderPipelineProps,
  ComputePipeline,
  ComputePipelineProps,
  CommandEncoderProps,
  TransformFeedbackProps,
  QuerySetProps
} from '@luma.gl/core';
import {Device, DeviceFeatures} from '@luma.gl/core';

import {NullDeviceInfo} from './null-device-info';
import {NullDeviceLimits} from './null-device-features';
import {NullCanvasContext} from './null-canvas-context';
import {NullBuffer} from './resources/null-buffer';
import {NullFramebuffer} from './resources/null-framebuffer';
import {NullShader} from './resources/null-shader';
import {NullCommandEncoder} from './resources/null-command-encoder';
import {NullSampler} from './resources/null-sampler';
import {NullTexture} from './resources/null-texture';
import {NullRenderPass} from './resources/null-render-pass';
import {NullRenderPipeline} from './resources/null-render-pipeline';
import {NullVertexArray} from './resources/null-vertex-array';
import {NullTransformFeedback} from './resources/null-transform-feedback';
import {NullQuerySet} from './resources/null-query-set';

/** Do-nothing device implementation for testing */
export class NullDevice extends Device {
  static isSupported(): boolean {
    return true;
  }
  readonly type = 'null';
  readonly handle = null;

  readonly preferredColorFormat = 'rgba8unorm';
  readonly preferredDepthFormat = 'depth24plus';

  features: DeviceFeatures = new DeviceFeatures([], this.props._disabledFeatures);
  limits: NullDeviceLimits = new NullDeviceLimits();
  readonly info = NullDeviceInfo;

  readonly canvasContext: NullCanvasContext;
  override commandEncoder: NullCommandEncoder;

  readonly lost: Promise<{reason: 'destroyed'; message: string}>;

  constructor(props: DeviceProps) {
    super({...props, id: props.id || 'null-device'});

    const canvasContextProps = Device._getCanvasContextProps(props);
    this.canvasContext = new NullCanvasContext(this, canvasContextProps);
    this.lost = new Promise(resolve => {});
    this.commandEncoder = new NullCommandEncoder(this, {id: 'null-command-encoder'});
  }

  /**
   * Destroys the context
   * @note Has no effect for null contexts
   */
  destroy(): void {}

  get isLost(): boolean {
    return false;
  }

  // IMPLEMENTATION OF ABSTRACT DEVICE

  getTextureByteAlignment(): number {
    return 1;
  }

  createCanvasContext(props: CanvasContextProps): NullCanvasContext {
    return new NullCanvasContext(this, props);
  }

  createBuffer(props: BufferProps | ArrayBuffer | ArrayBufferView): NullBuffer {
    const newProps = this._normalizeBufferProps(props);
    return new NullBuffer(this, newProps);
  }

  getDefaultRenderPass(): NullRenderPass {
    return new NullRenderPass(this, {});
  }

  createTexture(props: TextureProps): NullTexture {
    return new NullTexture(this, props);
  }

  createExternalTexture(props: ExternalTextureProps): ExternalTexture {
    throw new Error('createExternalTexture() not implemented'); // return new Program(props);
  }

  createSampler(props: SamplerProps): NullSampler {
    return new NullSampler(this, props);
  }

  createShader(props: ShaderProps): NullShader {
    return new NullShader(this, props);
  }

  createFramebuffer(props: FramebufferProps): NullFramebuffer {
    return new NullFramebuffer(this, props);
  }

  createVertexArray(props: VertexArrayProps): VertexArray {
    return new NullVertexArray(this, props);
  }

  createTransformFeedback(props: TransformFeedbackProps): NullTransformFeedback {
    return new NullTransformFeedback(this, props);
  }

  createQuerySet(props: QuerySetProps): NullQuerySet {
    return new NullQuerySet(this, props);
  }

  createRenderPipeline(props: RenderPipelineProps): NullRenderPipeline {
    return new NullRenderPipeline(this, props);
  }

  createComputePipeline(props?: ComputePipelineProps): ComputePipeline {
    throw new Error('ComputePipeline not supported in WebGL');
  }

  override createCommandEncoder(props: CommandEncoderProps = {}): NullCommandEncoder {
    return new NullCommandEncoder(this, props);
  }

  submit(): void {}

  override setParametersWebGL(parameters: any): void {}

  override getParametersWebGL(parameters: any): any {}

  override withParametersWebGL(parameters: any, func: any): any {
    const {nocatch = true} = parameters;
    let value: any;
    if (nocatch) {
      // Avoid try catch to minimize stack size impact for safe execution paths
      return func();
    }
    // Wrap in a try-catch to ensure that parameters are restored on exceptions
    try {
      value = func();
    } catch {
      // ignore
    }
    return value;
  }

  override _getDeviceSpecificTextureFormatCapabilities(format: any): any {
    return format;
  }
}
