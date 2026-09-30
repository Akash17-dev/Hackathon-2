import { promises as fs } from "fs";
import path from "path";
import { MongoClient, type Collection } from "mongodb";
import type { Campaign } from "./types";

const dataPath = path.join(process.cwd(), "data", "campaigns.json");
const hosted = process.env.VERCEL === "1";

type StoreFile = { campaigns: Campaign[] };

const globalForMongo = globalThis as unknown as {
  mongoClient?: MongoClient;
  mongoReady?: Promise<void>;
  indexed?: boolean;
  fileMode?: boolean;
  fileQueue?: Promise<unknown>;
};

function requireUri() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error("MONGODB_URI is not set");
  return uri;
}

async function client() {
  if (globalForMongo.mongoClient) return globalForMongo.mongoClient;
  const created = new MongoClient(requireUri(), {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8000,
  });
  await created.connect();
  globalForMongo.mongoClient = created;
  return created;
}

async function collection(): Promise<Collection<Campaign>> {
  const dbName = process.env.MONGODB_DB?.trim() || "hackathon";
  const db = (await client()).db(dbName);
  const campaigns = db.collection<Campaign>("campaigns");
  if (!globalForMongo.indexed) {
    await campaigns.createIndex({ id: 1 }, { unique: true });
    globalForMongo.indexed = true;
  }
  return campaigns;
}

async function readFile(): Promise<StoreFile> {
  try {
    const raw = await fs.readFile(dataPath, "utf8");
    const parsed = JSON.parse(raw) as StoreFile;
    if (!Array.isArray(parsed.campaigns)) return { campaigns: [] };
    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { campaigns: [] };
    throw error;
  }
}

async function writeFile(store: StoreFile) {
  await fs.mkdir(path.dirname(dataPath), { recursive: true });
  const temp = `${dataPath}.tmp`;
  await fs.writeFile(temp, JSON.stringify(store, null, 2));
  await fs.rename(temp, dataPath);
}

function withFileLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = globalForMongo.fileQueue ?? Promise.resolve();
  const run = previous.then(fn, fn);
  globalForMongo.fileQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function ensureMongo() {
  if (globalForMongo.fileMode) return false;
  if (!globalForMongo.mongoReady) {
    globalForMongo.mongoReady = (async () => {
      const campaigns = await collection();
      if (hosted) return;
      const local = await readFile();
      for (const campaign of local.campaigns) {
        await campaigns.updateOne({ id: campaign.id }, { $setOnInsert: campaign }, { upsert: true });
      }
    })().catch((error) => {
      globalForMongo.mongoReady = undefined;
      globalForMongo.mongoClient = undefined;
      if (!hosted) globalForMongo.fileMode = true;
      throw error;
    });
  }
  try {
    await globalForMongo.mongoReady;
    return true;
  } catch (error) {
    if (hosted) throw error;
    return false;
  }
}

export async function listCampaigns() {
  if (await ensureMongo()) {
    const campaigns = await collection();
    return campaigns.find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).toArray();
  }
  return withFileLock(async () => {
    const store = await readFile();
    return [...store.campaigns].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
}

export async function saveCampaign(campaign: Campaign) {
  if (await ensureMongo()) {
    const campaigns = await collection();
    await campaigns.updateOne({ id: campaign.id }, { $set: campaign }, { upsert: true });
    return campaign;
  }
  return withFileLock(async () => {
    const store = await readFile();
    const index = store.campaigns.findIndex((item) => item.id === campaign.id);
    if (index >= 0) store.campaigns[index] = campaign;
    else store.campaigns.push(campaign);
    await writeFile(store);
    return campaign;
  });
}

export async function getCampaign(id: string) {
  if (await ensureMongo()) {
    const campaigns = await collection();
    return campaigns.findOne({ id }, { projection: { _id: 0 } });
  }
  return withFileLock(async () => {
    const store = await readFile();
    return store.campaigns.find((item) => item.id === id) ?? null;
  });
}
