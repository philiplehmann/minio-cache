/** @format */

import {
	getCompressionMethod,
	getCacheFileName,
	createTempDirectory,
} from "@actions/cache/lib/internal/cacheUtils";
import { extractTar, listTar } from "@actions/cache/lib/internal/tar";
import {
	getInput,
	debug,
	info,
	isDebug,
	setFailed,
	warning,
} from "@actions/core";
import { join } from "node:path";
import { findObject, formatSize, newMinio, setCacheHitOutput } from "./utils";

process.on("uncaughtException", (e) => info(`warning: ${e.message}`));

async function restoreCache() {
	try {
		const bucket = getInput("bucket", { required: true });
		const key = getInput("key", { required: true });

		try {
			const mc = newMinio();

			const compressionMethod = await getCompressionMethod();
			const cacheFileName = getCacheFileName(compressionMethod);
			debug(`Cache file name: ${cacheFileName}`);
			const archivePath = join(await createTempDirectory(), cacheFileName);
			debug(`archivePath: ${archivePath}`);

			const obj = await findObject(mc, bucket, key, compressionMethod);
			info(`found cache object ${obj.name}`);
			info(
				`Downloading cache from s3 to ${archivePath}. bucket: ${bucket}, object: ${obj.name}`,
			);
			await mc.fGetObject(bucket, obj.name ?? "", archivePath);

			if (isDebug()) {
				await listTar(archivePath, compressionMethod);
			}

			info(`Cache Size: ${formatSize(obj.size)} (${obj.size} bytes)`);

			await extractTar(archivePath, compressionMethod);
			setCacheHitOutput(key, true);
			info("Cache restored from s3 successfully");
		} catch (e: unknown) {
			if (e instanceof Error) {
				info(`Restore s3 cache failed:  ${e.message}`);
				setCacheHitOutput(key, false);
				warning(`Cache ${key} not found`);
			}
		}
	} catch (e: unknown) {
		if (e instanceof Error) {
			setFailed(e.message);
		}
	}
}

restoreCache();
