// luma.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import type {TypedArray} from '@math.gl/types';
import type {
  DeviceProps,
  DeviceInfo,
  DeviceTextureFormatCapabilities,
  CanvasContextProps,
  Buffer,
  Texture,
  Framebuffer,
  VertexArray,
  VertexArrayProps,
  BufferProps,
  ShaderProps,
  // Sampler,
  SamplerProps,
  TextureProps,
  ExternalTexture,
  ExternalTextureProps,
  FramebufferProps,
  // RenderPipeline,
  RenderPipelineProps,
  ComputePipeline,
  ComputePipelineProps,
  // CommandEncoder,
  CommandEncoderProps,
  TransformFeedbackProps,
  QuerySetProps,
  Resource,
  VertexFormat
} from '@luma.gl/core';
import {Device, CanvasContext, log} from '@luma.gl/core';
import type {GLExtensions} from '@luma.gl/constants';
import {WebGLStateTracker} from '../context/state-tracker/webgl-state-tracker';
import {createBrowserContext} from '../context/helpers/create-browser-context';
import {getDeviceInfo} from './device-helpers/webgl-device-info';
import {WebGLDeviceFeatures} from './device-helpers/webgl-device-features';
import {WebGLDeviceLimits} from './device-helpers/webgl-device-limits';
import {WebGLCanvasContext} from './webgl-canvas-context';
import type {Spector} from '../context/debug/spector-types';
import {initializeSpectorJS} from '../context/debug/spector';
import {makeDebugContext} from '../context/debug/webgl-developer-tools';
import {getTextureFormatCapabilitiesWebGL} from './converters/webgl-texture-table';
import {uid} from '../utils/uid';

import {WEBGLBuffer} from './resources/webgl-buffer';
import {WEBGLShader} from './resources/webgl-shader';
import {WEBGLSampler} from './resources/webgl-sampler';
import {WEBGLTexture} from './resources/webgl-texture';
import {WEBGLFramebuffer} from './resources/webgl-framebuffer';
import {WEBGLRenderPipeline} from './resources/webgl-render-pipeline';
import {WEBGLCommandEncoder} from './resources/webgl-command-encoder';
import {WEBGLCommandBuffer} from './resources/webgl-command-buffer';
import {WEBGLVertexArray} from './resources/webgl-vertex-array';
import {WEBGLTransformFeedback} from './resources/webgl-transform-feedback';
import {WEBGLQuerySet} from './resources/webgl-query-set';

import {readPixelsToArray, readPixelsToBuffer} from './helpers/webgl-texture-utils';
import {
  setGLParameters,
  getGLParameters,
  resetGLParameters
} from '../context/parameters/unified-parameter-api';
import {withGLParameters} from '../context/state-tracker/with-parameters';
import {getWebGLExtension} from '../context/helpers/webgl-extensions';

/** WebGPU style Device API for a WebGL context */
export class WebGLDevice extends Device {
  // Public `Device` API

  /** type of this device */
  readonly type = 'webgl';

  // Use the ! assertion to handle the case where _reuseDevices causes the constructor to return early
  /** The underlying WebGL context */
  readonly handle!: WebGL2RenderingContext;
  features!: WebGLDeviceFeatures;
  limits!: WebGLDeviceLimits;
  readonly info!: DeviceInfo;
  readonly canvasContext!: WebGLCanvasContext;

  readonly preferredColorFormat = 'rgba8unorm';
  readonly preferredDepthFormat = 'depth24plus';

  commandEncoder!: WEBGLCommandEncoder;

  readonly lost: Promise<{reason: 'destroyed'; message: string}>;

  private _resolveContextLost?: (value: {reason: 'destroyed'; message: string}) => void;

  /** WebGL2 context. */
  readonly gl!: WebGL2RenderingContext;

  /** Store constants */
  // @ts-ignore TODO fix
  _constants: (TypedArray | null)[];

  /** State used by luma.gl classes - TODO - not used? */
  readonly _extensions: GLExtensions = {};
  _polyfilled: boolean = false;

  /** Instance of Spector.js (if initialized) */
  spectorJS!: Spector | null;

  //
  // Public API
  //

  override get [Symbol.toStringTag](): string {
    return 'WebGLDevice';
  }

  override toString(): string {
    return `${this[Symbol.toStringTag]}(${this.id})`;
  }

  override isVertexFormatSupported(format: VertexFormat): boolean {
    switch (format) {
      case 'unorm8x4-bgra':
        return false;
      default:
        return true;
    }
  }

  constructor(props: DeviceProps) {
    super({...props, id: props.id || uid('webgl-device')});

    const canvasContextProps = Device._getCanvasContextProps(props)!;

    // WebGL requires a canvas to be created before creating the context
    if (!canvasContextProps) {
      throw new Error('WebGLDevice requires props.createCanvasContext to be set');
    }

    // Check if the WebGL context is already associated with a device
    // Note that this can be avoided in webgl2adapter.create() if
    // DeviceProps._reuseDevices is set.
    // @ts-expect-error device is attached to context
    let device: WebGLDevice | undefined = canvasContextProps.canvas?.gl?.device;
    if (device) {
      throw new Error(`WebGL context already attached to device ${device.id}`);
    }

    // Create and instrument context
    this.canvasContext = new WebGLCanvasContext(this, canvasContextProps);

    this.lost = new Promise<{reason: 'destroyed'; message: string}>(resolve => {
      this._resolveContextLost = resolve;
    });

    const webglContextAttributes: WebGLContextAttributes = {...props.webgl};
    // Copy props from CanvasContextProps
    if (canvasContextProps.alphaMode === 'premultiplied') {
      webglContextAttributes.premultipliedAlpha = true;
    }
    if (props.powerPreference !== undefined) {
      webglContextAttributes.powerPreference = props.powerPreference;
    }

    // Check if we should attach to an externally created context or create a new context
    const externalGLContext = this.props._handle as WebGL2RenderingContext | null;

    const gl =
      externalGLContext ||
      createBrowserContext(
        this.canvasContext.canvas,
        {
          onContextLost: (event: Event) =>
            this._resolveContextLost?.({
              reason: 'destroyed',
              message: 'Entered sleep mode, or too many apps or browser tabs are using the GPU.'
            }),
          // eslint-disable-next-line no-console
          onContextRestored: (event: Event) => console.log('WebGL context restored')
        },
        webglContextAttributes
      );

    if (!gl) {
      throw new Error('WebGL context creation failed');
    }

    // Note that the browser will only create one WebGL context per canvas.
    // This means that a newly created gl context may already have a device attached to it.
    // @ts-expect-error luma.gl stores a device reference on the context.
    device = gl.device;
    if (device) {
      if (props._reuseDevices) {
        log.log(
          1,
          `Not creating a new Device, instead returning a reference to Device ${device.id} already attached to WebGL context`,
          device
        )();
        device._reused = true;
        return device;
      }
      throw new Error(`WebGL context already attached to device ${device.id}`);
    }

    this.handle = gl;
    this.gl = gl;

    // Add spector debug instrumentation to context
    // We need to trust spector integration to decide if spector should be initialized
    // We also run spector instrumentation first, otherwise spector can clobber luma instrumentation.
    this.spectorJS = initializeSpectorJS({...this.props, gl: this.handle});

    // Instrument context
    (this.gl as any).device = this; // Update GL context: Link webgl context back to device
    // TODO - remove, this is only used to detect debug contexts.
    (this.gl as any)._version = 2; // Update GL context: Store WebGL version field on gl context (HACK to identify debug contexts)

    // initialize luma Device fields
    this.info = getDeviceInfo(this.gl, this._extensions);
    this.limits = new WebGLDeviceLimits(this.gl);
    this.features = new WebGLDeviceFeatures(
      this.gl,
      this._extensions,
      this.props._disabledFeatures
    );
    if (this.props._initializeFeatures) {
      this.features.initializeFeatures();
    }

    // Install context state tracking
    const glState = new WebGLStateTracker(this.gl, {
      log: (...args: any[]) => log.log(1, ...args)()
    });
    glState.trackState(this.gl, {copyState: false});

    // DEBUG contexts: Add luma debug instrumentation to the context, force log level to at least 1
    const debugWebGL = props.debugWebGL || props.debug;
    const traceWebGL = props.debugWebGL;
    if (debugWebGL) {
      this.gl = makeDebugContext(this.gl, {debugWebGL, traceWebGL});
      log.warn('WebGL debug mode activated. Performance reduced.')();
      if (props.debugWebGL) {
        log.level = Math.max(log.level, 1);
      }
    }

    this.commandEncoder = new WEBGLCommandEncoder(this, {id: `${this}-command-encoder`});
  }

  /**
   * Destroys the device
   *
   * @note "Detaches" from the WebGL context unless _reuseDevices is true.
   *
   * @note The underlying WebGL context is not immediately destroyed,
   * but may be destroyed later through normal JavaScript garbage collection.
   * This is a fundamental limitation since WebGL does not offer any
   * browser API for destroying WebGL contexts.
   */
  destroy(): void {
    // Note that deck.gl (especially in React strict mode) depends on being able
    // to asynchronously create a Device against the same canvas (i.e. WebGL context)
    // multiple times and getting the same device back. Since deck.gl is not aware
    // of this sharing, it might call destroy() multiple times on the same device.
    // Therefore we must do nothing in destroy() if props._reuseDevices is true
    if (!this.props._reuseDevices && !this._reused) {
      // Delete the reference to the device that we store on the WebGL context
      delete (this.gl as any).device;
    }
  }

  get isLost(): boolean {
    return this.gl.isContextLost();
  }

  // IMPLEMENTATION OF ABSTRACT DEVICE

  getTextureByteAlignment(): number {
    return 4;
  }

  createCanvasContext(props?: CanvasContextProps): CanvasContext {
    throw new Error('WebGL only supports a single canvas');
  }

  createBuffer(props: BufferProps | ArrayBuffer | ArrayBufferView): WEBGLBuffer {
    const newProps = this._normalizeBufferProps(props);
    return new WEBGLBuffer(this, newProps);
  }

  createTexture(props: TextureProps): WEBGLTexture {
    return new WEBGLTexture(this, props);
  }

  createExternalTexture(props: ExternalTextureProps): ExternalTexture {
    throw new Error('createExternalTexture() not implemented'); // return new Program(props);
  }

  createSampler(props: SamplerProps): WEBGLSampler {
    return new WEBGLSampler(this, props);
  }

  createShader(props: ShaderProps): WEBGLShader {
    return new WEBGLShader(this, props);
  }

  createFramebuffer(props: FramebufferProps): WEBGLFramebuffer {
    return new WEBGLFramebuffer(this, props);
  }

  createVertexArray(props: VertexArrayProps): VertexArray {
    return new WEBGLVertexArray(this, props);
  }

  createTransformFeedback(props: TransformFeedbackProps): WEBGLTransformFeedback {
    return new WEBGLTransformFeedback(this, props);
  }

  createQuerySet(props: QuerySetProps): WEBGLQuerySet {
    return new WEBGLQuerySet(this, props);
  }

  createRenderPipeline(props: RenderPipelineProps): WEBGLRenderPipeline {
    return new WEBGLRenderPipeline(this, props);
  }

  createComputePipeline(props?: ComputePipelineProps): ComputePipeline {
    throw new Error('ComputePipeline not supported in WebGL');
  }

  override createCommandEncoder(props: CommandEncoderProps = {}): WEBGLCommandEncoder {
    return new WEBGLCommandEncoder(this, props);
  }

  /**
   * Offscreen Canvas Support: Commit the frame
   * https://developer.mozilla.org/en-US/docs/Web/API/WebGL2RenderingContext/commit
   * Chrome's offscreen canvas does not require gl.commit
   */
  submit(commandBuffer: WEBGLCommandBuffer): void {
    if (!commandBuffer) {
      commandBuffer = this.commandEncoder.finish();
      this.commandEncoder.destroy();
      this.commandEncoder = this.createCommandEncoder({id: `${this.id}-default-encoder`});
    }

    commandBuffer._executeCommands();
  }

  //
  // TEMPORARY HACKS - will be removed in v9.1
  //

  /** @deprecated - should use command encoder */
  override readPixelsToArrayWebGL(
    source: Framebuffer | Texture,
    options?: {
      sourceX?: number;
      sourceY?: number;
      sourceFormat?: number;
      sourceAttachment?: number;
      target?: Uint8Array | Uint16Array | Float32Array;
      // following parameters are auto deduced if not provided
      sourceWidth?: number;
      sourceHeight?: number;
      sourceType?: number;
    }
  ): Uint8Array | Uint16Array | Float32Array {
    return readPixelsToArray(source, options);
  }

  /** @deprecated - should use command encoder */
  override readPixelsToBufferWebGL(
    source: Framebuffer | Texture,
    options?: {
      sourceX?: number;
      sourceY?: number;
      sourceFormat?: number;
      target?: Buffer; // A new Buffer object is created when not provided.
      targetByteOffset?: number; // byte offset in buffer object
      // following parameters are auto deduced if not provided
      sourceWidth?: number;
      sourceHeight?: number;
      sourceType?: number;
    }
  ): Buffer {
    return readPixelsToBuffer(source, options);
  }

  override setParametersWebGL(parameters: any): void {
    setGLParameters(this.gl, parameters);
  }

  override getParametersWebGL(parameters: any): any {
    return getGLParameters(this.gl, parameters);
  }

  override withParametersWebGL(parameters: any, func: any): any {
    return withGLParameters(this.gl, parameters, func);
  }

  override resetWebGL(): void {
    log.warn('WebGLDevice.resetWebGL is deprecated, use only for debugging')();
    resetGLParameters(this.gl);
  }

  override _getDeviceSpecificTextureFormatCapabilities(
    capabilities: DeviceTextureFormatCapabilities
  ): DeviceTextureFormatCapabilities {
    return getTextureFormatCapabilitiesWebGL(this.gl, capabilities, this._extensions);
  }

  //
  // WebGL-only API (not part of `Device` API)
  //

  /**
   * Triggers device (or WebGL context) loss.
   * @note primarily intended for testing how application reacts to device loss
   */
  override loseDevice(): boolean {
    let deviceLossTriggered = false;
    const extensions = this.getExtension('WEBGL_lose_context');
    const ext = extensions.WEBGL_lose_context;
    if (ext) {
      deviceLossTriggered = true;
      ext.loseContext();
      // ext.loseContext should trigger context loss callback but the platform may not do this, so do it explicitly
    }
    this._resolveContextLost?.({
      reason: 'destroyed',
      message: 'Application triggered context loss'
    });
    return deviceLossTriggered;
  }

  /** Save current WebGL context state onto an internal stack */
  pushState(): void {
    const webglState = WebGLStateTracker.get(this.gl);
    webglState.push();
  }

  /** Restores previously saved context state */
  popState(): void {
    const webglState = WebGLStateTracker.get(this.gl);
    webglState.pop();
  }

  /**
   * Returns the GL.<KEY> constant that corresponds to a numeric value of a GL constant
   * Be aware that there are some duplicates especially for constants that are 0,
   * so this isn't guaranteed to return the right key in all cases.
   */
  getGLKey(value: unknown, options?: {emptyIfUnknown?: boolean}): string {
    const number = Number(value);
    for (const key in this.gl) {
      // @ts-ignore expect-error depends on settings
      if (this.gl[key] === number) {
        return `GL.${key}`;
      }
    }
    // No constant found. Stringify the value and return it.
    return options?.emptyIfUnknown ? '' : String(value);
  }

  /**
   * Returns a map with any GL.<KEY> constants mapped to strings, both for keys and values
   */
  getGLKeys(glParameters: Record<number, unknown>): Record<string, string> {
    const opts = {emptyIfUnknown: true};
    return Object.entries(glParameters).reduce<Record<string, string>>((keys, [key, value]) => {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      keys[`${key}:${this.getGLKey(key, opts)}`] = `${value}:${this.getGLKey(value, opts)}`;
      return keys;
    }, {});
  }

  /**
   * Set a constant value for a location. Disabled attributes at that location will read from this value
   * @note WebGL constants are stored globally on the WebGL context, not the VertexArray
   * so they need to be updated before every render
   * @todo - remember/cache values to avoid setting them unnecessarily?
   */
  setConstantAttributeWebGL(location: number, constant: TypedArray): void {
    const maxVertexAttributes = this.limits.maxVertexAttributes;
    this._constants = this._constants || new Array(maxVertexAttributes).fill(null);
    const currentConstant = this._constants[location];
    if (currentConstant && compareConstantArrayValues(currentConstant, constant)) {
      log.info(
        1,
        `setConstantAttributeWebGL(${location}) could have been skipped, value unchanged`
      )();
    }
    this._constants[location] = constant;

    switch (constant.constructor) {
      case Float32Array:
        setConstantFloatArray(this, location, constant as Float32Array);
        break;
      case Int32Array:
        setConstantIntArray(this, location, constant as Int32Array);
        break;
      case Uint32Array:
        setConstantUintArray(this, location, constant as Uint32Array);
        break;
      default:
        throw new Error('constant');
    }
  }

  /** Ensure extensions are only requested once */
  getExtension(name: keyof GLExtensions): GLExtensions {
    getWebGLExtension(this.gl, name, this._extensions);
    return this._extensions;
  }

  // INTERNAL SUPPORT METHODS FOR WEBGL RESOURCES

  /**
   * Storing data on a special field on WebGLObjects makes that data visible in SPECTOR chrome debug extension
   * luma.gl ids and props can be inspected
   */
  _setWebGLDebugMetadata(
    handle: unknown,
    resource: Resource<any>,
    options: {spector: Record<string, unknown>}
  ): void {
    // @ts-expect-error
    handle.luma = resource;

    const spectorMetadata = {props: options.spector, id: options.spector['id']};
    // @ts-expect-error
    // eslint-disable-next-line camelcase
    handle.__SPECTOR_Metadata = spectorMetadata;
  }
}

/** Set constant float array attribute */
function setConstantFloatArray(device: WebGLDevice, location: number, array: Float32Array): void {
  switch (array.length) {
    case 1:
      device.gl.vertexAttrib1fv(location, array);
      break;
    case 2:
      device.gl.vertexAttrib2fv(location, array);
      break;
    case 3:
      device.gl.vertexAttrib3fv(location, array);
      break;
    case 4:
      device.gl.vertexAttrib4fv(location, array);
      break;
    default:
    // assert(false);
  }
}

/** Set constant signed int array attribute */
function setConstantIntArray(device: WebGLDevice, location: number, array: Int32Array): void {
  device.gl.vertexAttribI4iv(location, array);
  // TODO - not clear if we need to use the special forms, more testing needed
  // switch (array.length) {
  //   case 1:
  //     gl.vertexAttribI1iv(location, array);
  //     break;
  //   case 2:
  //     gl.vertexAttribI2iv(location, array);
  //     break;
  //   case 3:
  //     gl.vertexAttribI3iv(location, array);
  //     break;
  //   case 4:
  //     break;
  //   default:
  //     assert(false);
  // }
}

/** Set constant unsigned int array attribute */
function setConstantUintArray(device: WebGLDevice, location: number, array: Uint32Array) {
  device.gl.vertexAttribI4uiv(location, array);
  // TODO - not clear if we need to use the special forms, more testing needed
  // switch (array.length) {
  //   case 1:
  //     gl.vertexAttribI1uiv(location, array);
  //     break;
  //   case 2:
  //     gl.vertexAttribI2uiv(location, array);
  //     break;
  //   case 3:
  //     gl.vertexAttribI3uiv(location, array);
  //     break;
  //   case 4:
  //     gl.vertexAttribI4uiv(location, array);
  //     break;
  //   default:
  //     assert(false);
  // }
}

/**
 * Compares contents of two typed arrays
 * @todo max length?
 */
function compareConstantArrayValues(v1: TypedArray, v2: TypedArray): boolean {
  if (!v1 || !v2 || v1.length !== v2.length || v1.constructor !== v2.constructor) {
    return false;
  }
  for (let i = 0; i < v1.length; ++i) {
    if (v1[i] !== v2[i]) {
      return false;
    }
  }
  return true;
}
