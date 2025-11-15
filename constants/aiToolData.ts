import { AIModel, StylePreset } from '../types';

export const DETAILED_AI_MODELS: AIModel[] = [
  {
    id: 'audition-ai-v4',
    name: 'modals.models.v4.name',
    description: 'modals.models.v4.description',
    apiModel: 'gemini-2.5-flash-image',
    tags: [{ text: 'modals.models.tags.recommended', color: 'red' }, { text: 'modals.models.tags.fast', color: 'blue' }],
    details: [
      'modals.models.v4.details.0',
      'modals.models.v4.details.1',
      'modals.models.v4.details.2',
      'modals.models.v4.details.3',
    ],
    recommended: true,
    supportedModes: ['image-to-image', 'text-to-image'],
  },
  {
    id: 'audition-ai-fast',
    name: 'modals.models.fast.name',
    description: 'modals.models.fast.description',
    apiModel: 'imagen-4.0-generate-001',
    tags: [{ text: 'modals.models.tags.new', color: 'cyan' }, { text: 'modals.models.tags.fast', color: 'blue' }, { text: 'modals.models.tags.highQuality', color: 'yellow' }],
    details: [
      'modals.models.fast.details.0',
      'modals.models.fast.details.1',
      'modals.models.fast.details.2',
      'modals.models.fast.details.3',
    ],
    supportedModes: ['text-to-image'],
  },
    {
    id: 'audition-ai-pro',
    name: 'modals.models.pro.name',
    description: 'modals.models.pro.description',
    apiModel: 'imagen-4.0-generate-001',
    tags: [{ text: 'modals.models.tags.highestQuality', color: 'yellow' }],
    details: [
      'modals.models.pro.details.0',
      'modals.models.pro.details.1',
      'modals.models.pro.details.2',
      'modals.models.pro.details.3',
    ],
    supportedModes: ['text-to-image'],
  },
  {
    id: 'audition-ai-ultra',
    name: 'modals.models.ultra.name',
    description: 'modals.models.ultra.description',
    apiModel: 'imagen-4.0-generate-001',
    tags: [{ text: 'modals.models.tags.new', color: 'cyan' }, { text: 'modals.models.tags.ultraQuality', color: 'yellow' }],
    details: [
      'modals.models.ultra.details.0',
      'modals.models.ultra.details.1',
      'modals.models.ultra.details.2',
      'modals.models.ultra.details.3',
    ],
    supportedModes: ['text-to-image'],
  }
];

export const STYLE_PRESETS_NEW: StylePreset[] = [
    { id: 'none', name: 'modals.styles.none' },
    { id: 'cinematic', name: 'modals.styles.cinematic' },
    { id: 'photographic', name: 'modals.styles.photographic' },
    { id: 'anime', name: 'modals.styles.anime' },
    { id: 'fantasy', name: 'modals.styles.fantasy' },
    { id: '3d_model', name: 'modals.styles.3d_model' },
    { id: 'dival_art', name: 'modals.styles.dival_art' },
    { id: 'pixel_art', name: 'modals.styles.pixel_art' },
];