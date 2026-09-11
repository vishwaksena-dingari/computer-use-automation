/**
 * @file Zod schemas for versioned Capability artifacts (docs/artifact-schema.md).
 */
import { z } from 'zod';

export const LocatorKindSchema = z.enum([
  'role',
  'label',
  'placeholder',
  'altText',
  'title',
  'text',
  'testId',
  'css',
]);

export const LocatorCandidateSchema = z
  .object({
    kind: LocatorKindSchema,
    rank: z.number().int().positive(),
    score: z.number().optional(),
    role: z.string().optional(),
    name: z.string().optional(),
    text: z.string().optional(),
    exact: z.boolean().optional(),
    selector: z.string().optional(),
  })
  .strict();

export const TargetRefSchema = z
  .object({
    $ref: z.string().regex(/^#\/targets\/.+/),
  })
  .strict();

export const TargetSchema = z
  .object({
    strict: z.boolean(),
    timeoutMs: z.number().int().positive(),
    candidates: z.array(LocatorCandidateSchema).min(1),
  })
  .strict();

export const CheckpointSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('visible'),
      target: TargetRefSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('hidden'),
      target: TargetRefSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('url'),
      includes: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('textIncludes'),
      text: z.string().min(1),
      target: TargetRefSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('allOf'),
      refs: z.array(z.string().min(1)).min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('anyOf'),
      refs: z.array(z.string().min(1)).min(1),
    })
    .strict(),
]);

export const BranchArmSchema = z.union([
  z
    .object({
      when: z.object({ checkpoint: z.string().min(1) }).strict(),
      next: z.string().min(1),
    })
    .strict(),
  z
    .object({
      when: z.object({ checkpoint: z.string().min(1) }).strict(),
      outcome: z.string().min(1),
    })
    .strict(),
]);

export const StepSchema = z.discriminatedUnion('action', [
  z
    .object({
      id: z.string().min(1),
      action: z.literal('navigate'),
      urlFrom: z.string().min(1),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      action: z.literal('fill'),
      target: TargetRefSchema,
      valueFrom: z.string().min(1),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      action: z.literal('click'),
      target: TargetRefSchema,
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      action: z.literal('extract'),
      target: TargetRefSchema,
      output: z.string().min(1),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      action: z.literal('wait'),
      timeoutMs: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      id: z.string().min(1),
      action: z.literal('branch'),
      on: z.array(BranchArmSchema).min(1),
    })
    .strict(),
]);

export const ParameterSchema = z
  .object({
    name: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean']),
    required: z.boolean(),
    sensitive: z.boolean(),
  })
  .strict();

export const OutputFieldSchema = z
  .object({
    name: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean']),
    sensitive: z.boolean(),
  })
  .strict();

export const BusinessOutcomeSchema = z
  .object({
    code: z.string().min(1),
    description: z.string().min(1),
  })
  .strict();

export const CapabilitySchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    version: z.string().min(1),
    surface: z.literal('web'),
    name: z.string().min(1),
    description: z.string().min(1),
    goalTemplate: z.string().min(1),
    bindings: z.record(z.unknown()),
    inputs: z.array(ParameterSchema),
    outputs: z.array(OutputFieldSchema),
    businessOutcomes: z.array(BusinessOutcomeSchema),
    steps: z.array(StepSchema).min(1),
    targets: z.record(TargetSchema),
    checkpoints: z.record(CheckpointSchema),
    successCheckpoint: z.string().min(1),
  })
  .strict()
  .superRefine((cap, ctx) => {
    if (!cap.checkpoints[cap.successCheckpoint]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `successCheckpoint "${cap.successCheckpoint}" missing from checkpoints`,
      });
    }
    const outcomeCodes = new Set(cap.businessOutcomes.map((b) => b.code));
    const outputNames = new Set(cap.outputs.map((o) => o.name));
    const extracts = new Set<string>();
    for (const step of cap.steps) {
      if (step.action === 'branch') {
        for (const arm of step.on) {
          if ('outcome' in arm && !outcomeCodes.has(arm.outcome)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `branch outcome "${arm.outcome}" not in businessOutcomes`,
            });
          }
          const ck = arm.when.checkpoint;
          if (!cap.checkpoints[ck]) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `branch checkpoint "${ck}" missing`,
            });
          }
        }
      }
      if (step.action === 'extract') {
        if (!outputNames.has(step.output)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `extract output "${step.output}" not declared`,
          });
        }
        extracts.add(step.output);
      }
      if ('target' in step) {
        const ref = step.target.$ref.replace('#/targets/', '');
        if (!cap.targets[ref]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `missing target ${ref}`,
          });
        }
      }
    }
    for (const name of outputNames) {
      if (!extracts.has(name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `output "${name}" has no extract step`,
        });
      }
    }
  });

export type Capability = z.infer<typeof CapabilitySchema>;
export type LocatorCandidate = z.infer<typeof LocatorCandidateSchema>;
export type Target = z.infer<typeof TargetSchema>;
