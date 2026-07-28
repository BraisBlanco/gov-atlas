import { z } from 'zod';
import { TaxonomyId } from './common.ts';
import { SourceTier } from './source.schema.ts';

/**
 * The taxonomies are data too, and a typo in a controlled vocabulary is worse than a
 * typo in a single country file: it silently detaches every ministry tagged with the
 * old id. So they get validated on the same footing as everything else.
 */

const LabelledSchema = z.strictObject({
  id: TaxonomyId,
  label_en: z.string().min(2),
  label_es: z.string().min(2),
});

export const PolicyAreaGroupSchema = LabelledSchema;

export const PolicyAreaSchema = LabelledSchema.extend({
  group: TaxonomyId,
});

export const PolicyAreasFileSchema = z.strictObject({
  groups: z.array(PolicyAreaGroupSchema).min(1),
  areas: z.array(PolicyAreaSchema).min(1),
});

export const ExclusionReasonSchema = LabelledSchema.extend({
  description_en: z.string().min(20),
  description_es: z.string().min(20),
});

export const ExclusionReasonsFileSchema = z.strictObject({
  reasons: z.array(ExclusionReasonSchema).min(1),
});

export const SourceTierDefSchema = z.strictObject({
  tier: SourceTier,
  id: TaxonomyId,
  label_en: z.string().min(2),
  label_es: z.string().min(2),
  description_en: z.string().min(20),
  description_es: z.string().min(20),
  requires_archive_url: z.boolean(),
});

export const SourceTypeDefSchema = LabelledSchema.extend({
  tier_hint: SourceTier,
});

export const SourceTiersFileSchema = z.strictObject({
  tiers: z.array(SourceTierDefSchema).min(1),
  source_types: z.array(SourceTypeDefSchema).min(1),
});

export type PolicyArea = z.infer<typeof PolicyAreaSchema>;
export type PolicyAreaGroup = z.infer<typeof PolicyAreaGroupSchema>;
export type ExclusionReason = z.infer<typeof ExclusionReasonSchema>;
export type SourceTierDef = z.infer<typeof SourceTierDefSchema>;
export type SourceTypeDef = z.infer<typeof SourceTypeDefSchema>;

export interface Taxonomy {
  policyAreas: PolicyArea[];
  policyAreaGroups: PolicyAreaGroup[];
  exclusionReasons: ExclusionReason[];
  tiers: SourceTierDef[];
  sourceTypes: SourceTypeDef[];
}
