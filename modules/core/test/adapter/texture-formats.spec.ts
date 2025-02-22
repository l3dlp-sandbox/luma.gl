// luma.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import test from 'tape-promise/tape';
import {getTestDevices} from '@luma.gl/test-utils';

// import {luma} from '@luma.gl/core';

// TODO - add full reference table, more exhaustive test
test('Device#isTextureFormatCompressed', async t => {
  for (const device of await getTestDevices()) {
    t.equal(device.isTextureFormatCompressed('rgba8unorm'), false);
    t.equal(device.isTextureFormatCompressed('bc3-rgba-unorm'), true);
  }
  t.end();
});
