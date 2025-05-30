// luma.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import type {FramebufferProps} from '@luma.gl/core';
import {Framebuffer} from '@luma.gl/core';
import type {NullDevice} from '../null-device';
import type {NullTextureView} from './null-texture-view';

export class NullFramebuffer extends Framebuffer {
  device: NullDevice;
  readonly handle = null;

  colorAttachments: NullTextureView[] = [];
  depthStencilAttachment: NullTextureView | null = null;

  constructor(device: NullDevice, props: FramebufferProps) {
    super(device, props);
    this.device = device;
  }

  protected override updateAttachments(): void {
    // Null framebuffers are JS only objects, nothing to
  }
}
