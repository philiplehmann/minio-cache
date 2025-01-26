/** @format */

import { getCacheFileName } from "@actions/cache/lib/internal/cacheUtils";
import type { CompressionMethod } from "@actions/cache/lib/internal/constants";
import {
	getInput,
	debug,
	info,
	error,
	type InputOptions,
	exportVariable,
} from "@actions/core";
import { Client, type BucketItem } from "minio";

export function newMinio() {
	const config = {
		endPoint: getInput("endpoint"),
		port: getInputAsInt("port"),
		useSSL: !getInputAsBoolean("insecure"),
		accessKey: getInput("accessKey"),
		secretKey: getInput("secretKey"),
	};
	info(`config: ${JSON.stringify(config)}`);
	return new Client(config);
}

export function getInputAsBoolean(
	name: string,
	options?: InputOptions,
): boolean {
	return getInput(name, options) === "true";
}

export function getInputAsArray(
	name: string,
	options?: InputOptions,
): string[] {
	return getInput(name, options)
		.split("\n")
		.map((s) => s.trim())
		.filter((x) => x !== "");
}

export function getInputAsInt(
	name: string,
	options?: InputOptions,
): number | undefined {
	const value = Number.parseInt(getInput(name, options), 10);
	if (Number.isNaN(value) || value < 0) {
		return undefined;
	}
	return value;
}

export function formatSize(value?: number, format = "bi") {
	if (!value) return "";
	const [multiple, k, suffix] = (
		format === "bi" ? [1000, "k", "B"] : [1024, "K", "iB"]
	) as [number, string, string];
	const exp = (Math.log(value) / Math.log(multiple)) | 0;
	const size = Number((value / multiple ** exp).toFixed(2));
	return (
		size +
		(exp ? `${k}MGTPEZY`[exp - 1] + suffix : `byte${size !== 1 ? "s" : ""}`)
	);
}

export function setCacheHitOutput(key: string, isCacheHit: boolean): void {
	debug(`cache-hit:  ${isCacheHit.toString()}`);
	if (isCacheHit) {
		exportVariable(`cache-hit-${key}`, isCacheHit);
	}
}

export function getCacheHitOutput(key: string): boolean {
	const state = process.env[`cache-hit-${key}`];
	debug(`state for key ${key} = ${state}`);
	return !!(state === "true");
}

export async function findObject(
	mc: Client,
	bucket: string,
	key: string,
	compressionMethod: CompressionMethod,
): Promise<BucketItem> {
	info(`Try find object with prefix: ${key}`);
	const cacheFileName = getCacheFileName(compressionMethod);
	let objects = await listObjects(mc, bucket);
	debug(`fn ${cacheFileName}`);
	debug(`Objects, ${JSON.stringify(objects, null, "  ")}`);
	objects = objects.filter((o) => {
		const isIncludes = o.name?.includes(key) ?? false;
		debug(`objects.filter ${o.name} includes ${key} ? = ${isIncludes}`);
		return isIncludes;
	});
	info(`Found ${JSON.stringify(objects, null, 2)}`);
	const sorted = objects.sort(
		(a, b) =>
			(a.lastModified &&
				b.lastModified &&
				b.lastModified.getTime() - a.lastModified.getTime()) ||
			0,
	);
	if (sorted.length > 0) {
		info(`Using latest ${JSON.stringify(sorted[0])}`);
		return sorted[0];
	}

	throw new Error("Cache item not found");
}

export function listObjects(mc: Client, bucket: string): Promise<BucketItem[]> {
	return new Promise((resolve, reject) => {
		info(`Try find objects in bucket ${bucket}`);
		const buckets = mc.listObjectsV2(bucket, undefined, true);
		const findedItems: BucketItem[] = [];
		let resolved = false;
		buckets.on("data", (obj) => {
			debug(`Buckets data ${JSON.stringify(obj)}`);
			findedItems.push(obj);
		});
		buckets.on("error", (e) => {
			error(`Buckets error ${JSON.stringify(e)}`);
			resolved = true;
			reject(e);
		});
		buckets.on("end", () => {
			debug(`Buckets end: ${findedItems}`);
			resolved = true;
			resolve(findedItems);
		});
		setTimeout(() => {
			if (!resolved)
				reject(new Error("list objects no result after 10 seconds"));
		}, 10000);
	});
}
