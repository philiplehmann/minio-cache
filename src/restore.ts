/** @format */

import {
	getCompressionMethod,
	resolvePaths,
	createTempDirectory,
	getCacheFileName,
} from "@actions/cache/lib/internal/cacheUtils";
import { extractTar, listTar } from "@actions/cache/lib/internal/tar";
import { info, getInput, isDebug } from "@actions/core";
import { join } from "node:path";
import { getCacheHitOutput, getInputAsArray, newMinio } from "./utils";

process.on("uncaughtException", (e) => info(`warning: ${e.message}`));

async function restoreCache() {
	try {
		const bucket = getInput("bucket", { required: true });
		const key = getInput("key", { required: true });
		const paths = getInputAsArray("path");
		info(`
      restoreCache

      bucket = ${bucket}
      key = ${key}
      paths = ${paths}
    `);

		const isCacheHit = getCacheHitOutput(key);
		info(`isCacheHit ${isCacheHit}`);
		if (!isCacheHit) {
			info(`Cache not found for key ${key}, skipping restore`);
			return;
		}

		const mc = newMinio();
		const compressionMethod = await getCompressionMethod();
		info(`Compression method ${compressionMethod}`);

		await Promise.all(
			paths.map(async (path) => {
				try {
					const cachePaths = await resolvePaths([path]);
					info(`[${path}] Cache Paths: ${JSON.stringify(cachePaths)}`);

					const archiveFolder = await createTempDirectory();
					info(`[${path}] archiveFolder: ${archiveFolder}`);

					const cacheFileName = getCacheFileName(compressionMethod);
					info(`[${path}] cacheFileName: ${cacheFileName}`);

					const archivePath = join(archiveFolder, cacheFileName);
					info(`[${path}] archivePath: ${archivePath}`);

					const object = join(key, path.replace(/\//g, "_"), cacheFileName);
					info(
						`[${path}] Downloading tar from s3. Bucket: ${bucket}, Object: ${object}`,
					);
					await mc.fGetObject(bucket, object, archivePath);
					info(
						`[${path}] Cache downloaded from s3 successfully for path ${path}`,
					);

					if (isDebug()) {
						await listTar(archivePath, compressionMethod);
					}

					await extractTar(archivePath, compressionMethod);
					info(`[${path}] Cache restored successfully for path ${path}`);
				} catch (e: unknown) {
					if (e instanceof Error) {
						info(`[${path}] Restore s3 cache failed: ${e.message}`);
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

restoreCache();
