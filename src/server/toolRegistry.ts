import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import { z, toJSONSchema } from 'zod/v4';

export type SecurityWrapperFactory = <T extends Record<string, unknown>>(
  namespace: string,
  operation: string,
  schema: z.ZodSchema<T>,
) => (
  accessToken: string,
) => (
  params: Record<string, unknown>,
) => (handler: (validated: T) => Promise<CallToolResult>) => Promise<CallToolResult>;

export interface ErrorHandlerContract {
  handleError(error: unknown, context: string): CallToolResult;
  createValidationError(message: string, details?: string): CallToolResult;
}

export interface ResponseFormatterContract {
  runWithMinifyOverride<T>(minifyOverride: boolean | undefined, fn: () => T): T;
}

export interface ToolRegistryCacheHelpers {
  generateKey?: (...segments: unknown[]) => string;
  invalidate?: (key: string) => void | Promise<void>;
  clear?: () => void | Promise<void>;
}

export interface DefaultArgumentResolverContext {
  name: string;
  rawArguments: Record<string, unknown>;
}

export type DefaultArgumentResolver<TInput extends Record<string, unknown>> = (
  context: DefaultArgumentResolverContext,
) => Partial<TInput> | Promise<Partial<TInput> | undefined> | undefined;

export interface ToolSecurityOptions {
  namespace?: string;
  operation?: string;
}

export interface ToolMetadataOptions {
  inputJsonSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

export interface ToolExecutionContext {
  accessToken: string;
  name: string;
  operation: string;
  rawArguments: Record<string, unknown>;
  cache?: ToolRegistryCacheHelpers;
}

export interface ToolExecutionPayload<TInput extends Record<string, unknown>> {
  input: TInput;
  context: ToolExecutionContext;
}

export type ToolHandler<TInput extends Record<string, unknown>> = (
  payload: ToolExecutionPayload<TInput>,
) => Promise<CallToolResult>;

export interface ToolDefinition<TInput extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema: z.ZodSchema<TInput>;
  handler: ToolHandler<TInput>;
  security?: ToolSecurityOptions;
  metadata?: ToolMetadataOptions;
  defaultArgumentResolver?: DefaultArgumentResolver<TInput>;
}

interface RegisteredTool<TInput extends Record<string, unknown>> extends ToolDefinition<TInput> {
  readonly security: Required<ToolSecurityOptions>;
}

export interface ToolExecutionOptions {
  name: string;
  accessToken: string;
  arguments?: Record<string, unknown>;
  minifyOverride?: boolean;
}

export interface ToolRegistryDependencies {
  withSecurityWrapper: SecurityWrapperFactory;
  errorHandler: ErrorHandlerContract;
  responseFormatter: ResponseFormatterContract;
  cacheHelpers?: ToolRegistryCacheHelpers;
}

const MINIFY_HINT_KEYS = ['minify', '_minify', '__minify'] as const;

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool<Record<string, unknown>>>();

  constructor(private readonly deps: ToolRegistryDependencies) {}

  register<TInput extends Record<string, unknown>>(definition: ToolDefinition<TInput>): void {
    this.assertValidDefinition(definition);

    if (this.tools.has(definition.name)) {
      throw new Error(`Tool '${definition.name}' is already registered`);
    }

    const resolved: RegisteredTool<TInput> = {
      ...definition,
      security: {
        namespace: definition.security?.namespace ?? 'ynab',
        operation: definition.security?.operation ?? definition.name,
      },
    };

    this.tools.set(definition.name, resolved as unknown as RegisteredTool<Record<string, unknown>>);
  }

  listTools(): Tool[] {
    return Array.from(this.tools.values()).map((tool) => {
      const inputSchema =
        (tool.metadata?.inputJsonSchema as Tool['inputSchema'] | undefined) ??
        (this.generateJsonSchema(tool.inputSchema) as Tool['inputSchema']);
      const result: Tool = {
        name: tool.name,
        description: tool.description,
        inputSchema,
      };
      if (tool.metadata?.annotations) {
        result.annotations = tool.metadata.annotations;
      }
      return result;
    });
  }

  getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((tool) => {
      const definition: ToolDefinition = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        handler: tool.handler,
        security: tool.security,
      };
      if (tool.metadata) {
        definition.metadata = tool.metadata;
      }
      if (tool.defaultArgumentResolver) {
        definition.defaultArgumentResolver = tool.defaultArgumentResolver;
      }
      return definition;
    });
  }

  async executeTool(options: ToolExecutionOptions): Promise<CallToolResult> {
    const tool = this.tools.get(options.name);
    if (!tool) {
      return this.deps.errorHandler.createValidationError(
        `Unknown tool: ${options.name}`,
        'The requested tool is not registered with the server',
      );
    }

    let defaults: Partial<Record<string, unknown>> | undefined;

    if (tool.defaultArgumentResolver) {
      try {
        defaults = await tool.defaultArgumentResolver({
          name: tool.name,
          rawArguments: options.arguments ?? {},
        });
      } catch (error) {
        return this.deps.errorHandler.createValidationError(
          'Invalid parameters',
          error instanceof Error
            ? error.message
            : 'Unknown error during default argument resolution',
        );
      }
    }

    const rawArguments: Record<string, unknown> = {
      ...(defaults ?? {}),
      ...(options.arguments ?? {}),
    };

    const minifyOverride = this.extractMinifyOverride(options, rawArguments);

    const run = async (): Promise<CallToolResult> => {
      try {
        const secured = this.deps.withSecurityWrapper(
          tool.security.namespace,
          tool.security.operation,
          tool.inputSchema,
        )(options.accessToken)(rawArguments);

        return await secured(async (validated) => {
          try {
            const context: ToolExecutionContext = {
              accessToken: options.accessToken,
              name: tool.name,
              operation: tool.security.operation,
              rawArguments,
            };
            if (this.deps.cacheHelpers) {
              context.cache = this.deps.cacheHelpers;
            }
            return await tool.handler({
              input: validated,
              context,
            });
          } catch (handlerError) {
            return this.deps.errorHandler.handleError(
              handlerError,
              `executing ${tool.name} - ${tool.security.operation}`,
            );
          }
        });
      } catch (securityError) {
        return this.normalizeSecurityError(securityError, tool);
      }
    };

    try {
      return await this.deps.responseFormatter.runWithMinifyOverride(minifyOverride, run);
    } catch (formatterError) {
      return this.deps.errorHandler.handleError(
        formatterError,
        `formatting response for ${tool.name}`,
      );
    }
  }

  private normalizeSecurityError(
    error: unknown,
    tool: RegisteredTool<Record<string, unknown>>,
  ): CallToolResult {
    if (error instanceof z.ZodError) {
      return this.deps.errorHandler.createValidationError(
        `Invalid parameters for ${tool.name}`,
        error.message,
      );
    }

    if (error instanceof Error && error.message.includes('Validation failed')) {
      return this.deps.errorHandler.createValidationError(
        `Invalid parameters for ${tool.name}`,
        error.message,
      );
    }

    return this.deps.errorHandler.handleError(error, `executing ${tool.name}`);
  }

  private extractMinifyOverride(
    options: ToolExecutionOptions,
    args: Record<string, unknown>,
  ): boolean | undefined {
    if (typeof options.minifyOverride === 'boolean') {
      return options.minifyOverride;
    }

    for (const key of MINIFY_HINT_KEYS) {
      const value = args[key];
      if (typeof value === 'boolean') {
        return value;
      }
    }

    return undefined;
  }

  private assertValidDefinition<TInput extends Record<string, unknown>>(
    definition: ToolDefinition<TInput>,
  ): void {
    if (!definition || typeof definition !== 'object') {
      throw new Error('Tool definition must be an object');
    }

    if (!definition.name || typeof definition.name !== 'string') {
      throw new Error('Tool definition requires a non-empty name');
    }

    if (!definition.description || typeof definition.description !== 'string') {
      throw new Error(`Tool '${definition.name}' requires a description`);
    }

    if (!definition.inputSchema || typeof definition.inputSchema.parse !== 'function') {
      throw new Error(`Tool '${definition.name}' requires a valid Zod schema`);
    }

    if (typeof definition.handler !== 'function') {
      throw new Error(`Tool '${definition.name}' requires a handler function`);
    }

    if (
      definition.defaultArgumentResolver &&
      typeof definition.defaultArgumentResolver !== 'function'
    ) {
      throw new Error(
        `Tool '${definition.name}' defaultArgumentResolver must be a function when provided`,
      );
    }
  }

  private generateJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
    try {
      return toJSONSchema(schema, { target: 'draft-2020-12', io: 'output' });
    } catch {
      return { type: 'object', additionalProperties: true };
    }
  }
}
