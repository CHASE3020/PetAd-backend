import type { RawEnvConfig } from './env.schema';
import { envSchema } from './env.schema';

/**
 * Error thrown when boot-time environment validation fails.
 * The message lists only the names of the invalid variables -
 * secret values are never included.
 */
export class EnvValidationError extends Error {
  public override readonly name = 'EnvValidationError';

  constructor(public readonly invalidKeys: string[]) {
    super(
      `Invalid environment variables: ${invalidKeys
        .slice()
        .sort()
        .join(', ')}. Fix them and restart the application.`,
    );
    Object.setPrototypeOf(this, EnvValidationError.prototype);
  }
}

/**
 * Validate process.env against the application schema.
 *
 * Must be called before the NestJS application bootstraps so an
 * operator-facing error is emitted as early as possible.
 *
 * Throws EnvValidationError listing every invalid variable name
 * (no secret values exposed) when validation fails.
 *
 * @returns The validated, flat RawEnvConfig.
 */
export function validateEnv(): RawEnvConfig {
  const { error, value } = envSchema.validate(process.env, {
    abortEarly: false,
    allowUnknown: true,
  });

  if (error) {
    const invalidKeys = error.details.map((detail) => detail.path.join('.'));
    throw new EnvValidationError(invalidKeys);
  }

  return value;
}
