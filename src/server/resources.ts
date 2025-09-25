/**
 * Resources module for YNAB MCP Server
 *
 * Handles MCP resource definitions and handlers.
 * Extracted from YNABMCPServer to provide focused, testable resource management.
 */

import type * as ynab from 'ynab';
import { responseFormatter } from './responseFormatter.js';

type ResponseFormatterType = typeof responseFormatter;

/**
 * Resource handler function signature
 */
export type ResourceHandler = (
  uri: string,
  dependencies: ResourceDependencies,
) => Promise<{
  contents: {
    uri: string;
    mimeType: string;
    text: string;
  }[];
}>;

/**
 * Resource definition structure
 */
export interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

/**
 * Injectable dependencies for resource handlers
 */
export interface ResourceDependencies {
  ynabAPI: ynab.API;
  responseFormatter: ResponseFormatterType;
}

/**
 * Resource handlers
 */
const resourceHandlers: Record<string, ResourceHandler> = {
  'ynab://budgets': async (uri, { ynabAPI, responseFormatter }) => {
    try {
      const response = await ynabAPI.budgets.getBudgets();
      const budgets = response.data.budgets.map((budget) => ({
        id: budget.id,
        name: budget.name,
        last_modified_on: budget.last_modified_on,
        first_month: budget.first_month,
        last_month: budget.last_month,
        currency_format: budget.currency_format,
      }));

      return {
        contents: [
          {
            uri: uri,
            mimeType: 'application/json',
            text: responseFormatter.format({ budgets }),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to fetch budgets: ${error}`);
    }
  },

  'ynab://user': async (uri, { ynabAPI, responseFormatter }) => {
    try {
      const response = await ynabAPI.user.getUser();
      const user = {
        id: response.data.user.id,
      };

      return {
        contents: [
          {
            uri: uri,
            mimeType: 'application/json',
            text: responseFormatter.format({ user }),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to fetch user info: ${error}`);
    }
  },
};

/**
 * Resource definitions
 */
const resourceDefinitions: ResourceDefinition[] = [
  {
    uri: 'ynab://budgets',
    name: 'YNAB Budgets',
    description: 'List of all available budgets',
    mimeType: 'application/json',
  },
  {
    uri: 'ynab://user',
    name: 'YNAB User Info',
    description: 'Current user information and subscription details',
    mimeType: 'application/json',
  },
];

/**
 * ResourceManager class that handles resource registration and request handling
 */
export class ResourceManager {
  private dependencies: ResourceDependencies;

  constructor(dependencies: ResourceDependencies) {
    this.dependencies = dependencies;
  }

  /**
   * Returns list of available resources for MCP resource listing
   */
  listResources(): { resources: ResourceDefinition[] } {
    return {
      resources: resourceDefinitions,
    };
  }

  /**
   * Handles resource read requests
   */
  async readResource(uri: string): Promise<{
    contents: {
      uri: string;
      mimeType: string;
      text: string;
    }[];
  }> {
    const handler = resourceHandlers[uri];
    if (!handler) {
      throw new Error(`Unknown resource: ${uri}`);
    }

    return await handler(uri, this.dependencies);
  }
}
