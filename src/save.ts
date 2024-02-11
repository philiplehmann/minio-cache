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

		try {
			const mc = newMinio();

			const compressionMethod = await getCompressionMethod();
			info(`Compression method ${compressionMethod}`);
			const cachePaths = await resolvePaths(paths);
			info(`Cache Paths: ${JSON.stringify(cachePaths)}`);

			const archiveFolder = await createTempDirectory();
			info(`archiveFolder: ${archiveFolder}`);

			const cacheFileName = getCacheFileName(compressionMethod); // cache.tzst
			info(`cacheFileName: ${cacheFileName}`);

			const archivePath = join(archiveFolder, cacheFileName); // /Volumes/MacintoshHD2/actions-runner/_work/_temp/d251b5bc-37a0-44b0-8df1-ad374bb5440a/cache.tzst
			info(`archivePath: ${archivePath}`);

			await createTar(archiveFolder, cachePaths, compressionMethod);
			if (isDebug()) {
				await listTar(archivePath, compressionMethod);
			}

			const object = join(key, cacheFileName);

			info(`Uploading tar to s3. Bucket: ${bucket}, Object: ${object}`);
			await mc.fPutObject(bucket, object, archivePath, {});
			info("Cache saved to s3 successfully");
		} catch (e: unknown) {
			if (e instanceof Error) {
				info(`Save s3 cache failed: ${e.message}`);
			}
		}
	} catch (e: unknown) {
		if (e instanceof Error) {
			info(`warning: ${e.message}`);
		}
	}
}

saveCache();
