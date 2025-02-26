import axios, { AxiosError } from "axios";
import { FigmaError } from "~/types/figma";
import fs from "fs";
import {
  parseFigmaFileResponse,
  parseFigmaResponse,
  SimplifiedDesign,
} from "./simplify-node-response";
import type {
  GetFileResponse,
  GetFileNodesResponse,
  GetImagesResponse,
} from "@figma/rest-api-spec";

export class FigmaService {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.figma.com/v1";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string): Promise<T> {
    try {
      console.log(`Calling ${this.baseUrl}${endpoint}`);
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        headers: {
          "X-Figma-Token": this.apiKey,
        },
      });

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError && error.response) {
        throw {
          status: error.response.status,
          err: (error.response.data as { err?: string }).err || "Unknown error",
        } as FigmaError;
      }
      throw new Error("Failed to make request to Figma API");
    }
  }

  async getFile(fileKey: string, depth?: number): Promise<SimplifiedDesign> {
    try {
      const endpoint = `/files/${fileKey}${depth ? `?depth=${depth}` : ""}`;
      console.log(`Calling ${this.baseUrl}${endpoint}`);
      const response = await this.request<GetFileResponse>(endpoint);
      console.log("Got response");
      const simplifiedResponse = parseFigmaFileResponse(response);
      writeLogs("figma-raw.json", response);
      writeLogs("figma-simplified.json", simplifiedResponse);
      return simplifiedResponse;
    } catch (e) {
      console.log("hi?");
      console.error("Failed to get file:", e);
      throw e;
    }
  }

  async getNode(fileKey: string, nodeId: string, depth?: number): Promise<SimplifiedDesign> {
    const endpoint = `/files/${fileKey}/nodes?ids=${nodeId}${depth ? `&depth=${depth}` : ""}`;
    const response = await this.request<GetFileNodesResponse>(endpoint);
    writeLogs("figma-raw.json", response);
    const simplifiedResponse = parseFigmaResponse(response);
    writeLogs("figma-simplified.json", simplifiedResponse);
    return simplifiedResponse;
  }

  /**
   * Get an image for a specific node in a Figma file
   * @param fileKey The key of the Figma file
   * @param nodeId The ID of the node to get an image for
   * @returns The image URL
   */
  async getNodeImage(fileKey: string, nodeId: string): Promise<string> {
    try {
      const formattedNodeId = nodeId.replace("-", ":");
      // First, we need to get the image URLs from the Figma API
      const endpoint = `/images/${fileKey}?ids=${formattedNodeId}&scale=1&format=png`;

      const response = await this.request<GetImagesResponse>(endpoint);

      if (response.err) {
        throw new Error(response.err);
      }

      const imageUrl = response.images[formattedNodeId];

      if (!imageUrl) {
        throw new Error(`No image URL found for node ${formattedNodeId}`);
      }

      return imageUrl;
    } catch (error) {
      console.error(`Failed to get image for node ${nodeId} from file ${fileKey}:`, error);
      throw error;
    }
  }

  /**
   * Fetch the actual image data from a Figma image URL
   * @param imageUrl The URL of the image to fetch
   * @returns The image data as a base64 string
   */
  async fetchImageData(imageUrl: string): Promise<string> {
    try {
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
      });

      // Convert the image data to a base64 string
      const base64 = Buffer.from(response.data, "binary").toString("base64");

      return base64;
    } catch (error) {
      console.error("Failed to fetch image data:", error);
      throw error;
    }
  }
}

function writeLogs(name: string, value: any) {
  try {
    if (process.env.NODE_ENV !== "development") return;

    const logsDir = "logs";

    try {
      fs.accessSync(process.cwd(), fs.constants.W_OK);
    } catch (error) {
      console.log("Failed to write logs:", error);
      return;
    }

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir);
    }
    fs.writeFileSync(`${logsDir}/${name}`, JSON.stringify(value, null, 2));
  } catch (error) {
    console.debug("Failed to write logs:", error);
  }
}
