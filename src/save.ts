/** @format */

import {
	getCompressionMethod,
	resolvePaths,
	createTempDirectory,
	getCacheFileName,
} from "@actions/cache/lib/internal/cacheUtils";
import { createTar, listTar } from "@actions/cache/lib/internal/tar";
import { info, getInput, isDebug } from "@actions/core";
import { join } from "node:path";
import { getCacheHitOutput, getInputAsArray, newMinio } from "./utils";

process.on("uncaughtException", (e) => info(`warning: ${e.message}`));

async function saveCache() {
	try {
		const bucket = getInput("bucket", { required: true });
		const key = getInput("key", { required: true });
		const paths = getInputAsArray("path");
		info(`
      saveCache

      bucket = ${bucket}
      key = ${key}
      paths = ${paths}
    `);

		const isCacheHit = getCacheHitOutput(key);
		info(`isCacheHit ${isCacheHit}`);
		if (isCacheHit) {
			info(`Found cache hit for key ${key}, ignore uploading`);
			// TODO: return
		} else {
			info(`Cache not found for key ${key}, start uploading`);
		}

		const mc = newMinio();
		const compressionMethod = await getCompressionMethod();
		info(`Compression method ${compressionMethod}`);

		await Promise.all(
			paths.map(async (path) => {
				try {
					const cachePaths = await resolvePaths([path]);
					info(`[${path}] Cache Path: ${cachePaths}`);

					const archiveFolder = await createTempDirectory();
					info(`[${path}] archiveFolder: ${archiveFolder}`);

					const cacheFileName = getCacheFileName(compressionMethod);
					info(`[${path}] cacheFileName: ${cacheFileName}`);

					const archivePath = join(archiveFolder, cacheFileName);
					info(`[${path}] archivePath: ${archivePath}`);

					await createTar(archiveFolder, cachePaths, compressionMethod);
					if (isDebug()) {
						await listTar(archivePath, compressionMethod);
					}

					const object = join(key, path.replace(/\//g, "_"), cacheFileName);

					info(
						`[${path}] Uploading tar to s3. Bucket: ${bucket}, Object: ${object}`,
					);
					await mc.fPutObject(bucket, object, archivePath, {});
					info(`[${path}] Cache saved to s3 successfully for path ${path}`);
				} catch (e: unknown) {
					console.error(e);
					if (e instanceof Error) {
						info(`[${path}] Save s3 cache failed: ${e.message}`);
					}
				}
			}),
		);
	} catch (e: unknown) {
		if (e instanceof Error) {
			info(`warning: ${e.message}`);
		}
	}
}

saveCache();
