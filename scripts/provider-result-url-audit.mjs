import assert from 'node:assert/strict';
import {
  extractProviderResultUrl,
  isResultUrlCompatibleWithAssetType,
} from '../shared/providerResultUrl.ts';

const failedGommoVideoPayload = {
  status: 'failed',
  message: 'Tạo video thất bại #vid_fail',
  images: [{ url: 'https://cdn.example.com/reference.jpg' }],
  download_url: '',
};

assert.equal(extractProviderResultUrl(failedGommoVideoPayload, 'video'), null);
assert.equal(
  extractProviderResultUrl({ status: 'completed', download_url: 'https://cdn.example.com/output.mp4' }, 'video'),
  'https://cdn.example.com/output.mp4',
);
assert.equal(
  extractProviderResultUrl({ data: { outputs: [{ image_url: 'https://cdn.example.com/output.webp' }] } }, 'image'),
  'https://cdn.example.com/output.webp',
);
assert.equal(extractProviderResultUrl({ result: 'https://cdn.example.com/output.png' }, 'video'), null);
assert.equal(extractProviderResultUrl({ result: 'https://cdn.example.com/output.mp4' }, 'image'), null);
assert.equal(
  extractProviderResultUrl({ result: 'data:image/png;base64,aGVsbG8=' }, 'image'),
  'data:image/png;base64,aGVsbG8=',
);
assert.equal(isResultUrlCompatibleWithAssetType('https://cdn.example.com/download?id=123', 'video'), true);

console.log('Provider result URL asset-type audit passed.');
