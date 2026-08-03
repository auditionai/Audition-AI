export type GommoServerModeLike = {
  type?: string | number | null;
  name?: string | null;
  group?: string | null;
  groupSubtitle?: string | null;
  group_subtitle?: string | null;
  status?: string | null;
};

export type GommoServerModelLike = {
  model?: string | null;
  server?: string | null;
  modes?: GommoServerModeLike[] | null;
  mode?: GommoServerModeLike[] | null;
};

const normalize = (value: unknown) => String(value || '').trim().toLowerCase();
const slugify = (value: unknown) => normalize(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const getModeType = (mode: GommoServerModeLike) => String(mode.type ?? mode.name ?? '').trim();
const getModes = (model: GommoServerModelLike) => [...(model.modes || []), ...(model.mode || [])];

export const getGommoServerIdForMode = (model: GommoServerModelLike, modeType?: string | null) => {
  const selectedMode = getModes(model).find((mode) => normalize(getModeType(mode)) === normalize(modeType));
  const groupId = slugify(selectedMode?.group);
  return groupId || slugify(model.server) || slugify(model.model) || 'gommo-gateway';
};

export const getGommoServerGroups = (model: GommoServerModelLike) => {
  const groups = new Map<string, {
    id: string;
    label: string;
    subtitle: string;
    modeTypes: string[];
  }>();

  for (const mode of getModes(model)) {
    const type = getModeType(mode);
    if (!type) continue;
    const id = slugify(mode.group) || slugify(model.server) || slugify(model.model) || 'gommo-gateway';
    const existing = groups.get(id) || {
      id,
      label: String(mode.group || model.server || 'Gommo Gateway').trim(),
      subtitle: String(mode.groupSubtitle || mode.group_subtitle || '').trim(),
      modeTypes: [],
    };
    if (!existing.modeTypes.includes(type)) existing.modeTypes.push(type);
    groups.set(id, existing);
  }

  if (groups.size === 0) {
    const id = slugify(model.server) || slugify(model.model) || 'gommo-gateway';
    groups.set(id, {
      id,
      label: String(model.server || 'Gommo Gateway').trim(),
      subtitle: '',
      modeTypes: [],
    });
  }

  return Array.from(groups.values());
};

