const fs = require("fs");
const path = require("path");
const { ArgumentParser } = require("argparse");
const { exiftool } = require("exiftool-vendored");

const parser = new ArgumentParser({
  description: "Process Google Photos takeout media and metadata.",
});
parser.add_argument("--input", { required: true, help: "Input directory" });
parser.add_argument("--output", { required: true, help: "Output directory" });
parser.add_argument("--utc-time-shift", {
  type: "float",
  help: "Timezone offset from UTC in hours",
});
parser.add_argument("--try-time-filename", {
  action: "store_true",
  help: "Use a timestamp in the filename when available",
});
parser.add_argument("--move-mode", {
  action: "store_true",
  help: "Move media instead of copying it",
});
parser.add_argument("--ignore", {
  action: "append",
  default: [],
  help: "Directory name to ignore (can be repeated)",
});
parser.add_argument("--maintain-original-dirs", {
  action: "store_true",
  help: "Preserve the input directory structure",
});
parser.add_argument("--rule", {
  action: "append",
  default: [],
  help: "Filename rule in /regex/flags=directory format (can be repeated)",
});
parser.add_argument("--rule-default-dir", {
  help: "Directory for files that match no rule",
});
parser.add_argument("--ignore-missing-json", {
  action: "store_true",
  help: "Continue when media metadata is missing",
});

const args = parser.parse_args();
const sourceDir = path.resolve(args.input);
const outputDir = path.resolve(args.output);
const ignoreDirectories = new Set(args.ignore);

if (args.maintain_original_dirs && args.rule.length > 0)
  parser.error("--rule cannot be used with --maintain-original-dirs");
if (args.rule_default_dir && args.rule.length === 0)
  parser.error("--rule-default-dir requires at least one --rule");
if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory())
  parser.error(`Input directory does not exist: ${sourceDir}`);

fs.mkdirSync(outputDir, { recursive: true });

const googlePhotosExtensions = [
  // Standard Image Formats
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".ico",
  ".tiff",
  ".avif",
  ".heic",

  // RAW Photo Formats
  ".dng",
  ".crw",
  ".cr2",
  ".nef",
  ".orf",
  ".raf",
  ".arw",
  ".pef",
  ".srw",
  ".rw2",

  // Video Formats
  ".mp4",
  ".mov",
  ".avi",
  ".mkv",
  ".m4v",
  ".3gp",
  ".3g2",
  ".wmv",
  ".asf",
  ".divx",
  ".mpg",
  ".m2t",
  ".m2ts",
  ".mts",
  ".tod",
  ".mod",
  ".mmv",
];

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function collectMediaFiles(dirPath, files = []) {
  for (const item of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, item.name);
    if (item.isDirectory()) {
      if (ignoreDirectories.has(item.name) || isInside(outputDir, fullPath))
        continue;
      collectMediaFiles(fullPath, files);
    } else if (
      item.isFile() &&
      googlePhotosExtensions.includes(path.extname(item.name).toLowerCase())
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function findMetadataPath(mediaPath) {
  const mediaName = path.basename(mediaPath);
  const parsedMediaName = path.parse(mediaName);
  const editedSuffixMatch = parsedMediaName.name.match(/^(.*)-edited$/);
  const lookupMediaName = editedSuffixMatch
    ? `${editedSuffixMatch[1]}${parsedMediaName.ext}`
    : mediaName;
  const parsedLookupName = path.parse(lookupMediaName);
  const duplicateSuffixMatch = parsedLookupName.name.match(/^(.*)(\(\d+\))$/);
  const metadataNames = duplicateSuffixMatch
    ? [
        `${duplicateSuffixMatch[1]}${parsedLookupName.ext}.supplemental-metadata${duplicateSuffixMatch[2]}.json`,
        `${lookupMediaName}.supplemental-metadata.json`,
      ]
    : [`${lookupMediaName}.supplemental-metadata.json`];
  return metadataNames
    .map((metadataName) => path.join(path.dirname(mediaPath), metadataName))
    .find((candidatePath) => fs.existsSync(candidatePath));
}

function parseRules(ruleArguments) {
  return ruleArguments.map((rule) => {
    const match = rule.match(/^\/(.*)\/([dgimsuvy]*)=(.+)$/);
    if (!match)
      parser.error(`Invalid --rule: ${rule}. Expected /regex/flags=directory`);
    try {
      return {
        expression: new RegExp(match[1], match[2]),
        directory: match[3],
      };
    } catch (error) {
      parser.error(`Invalid regular expression in --rule: ${error.message}`);
    }
  });
}

function extractFilenameDate(filename) {
  const match = filename.match(
    /(\d{4})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/,
  );
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

function formatExifDate(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}:${pad(date.getUTCMonth() + 1)}:${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function metadataTags(metadata, mediaPath) {
  const timestamp = Number(metadata.photoTakenTime?.timestamp);
  const metadataDate = Number.isFinite(timestamp)
    ? new Date(timestamp * 1000)
    : null;
  const filenameDate = args.try_time_filename
    ? extractFilenameDate(path.basename(mediaPath))
    : null;
  const photoDate = filenameDate || metadataDate;
  if (!photoDate) return {};
  const shift = filenameDate ? 0 : (args.utc_time_shift ?? 0);
  const adjustedDate = new Date(photoDate.getTime() + shift * 60 * 60 * 1000);
  const formattedDate = formatExifDate(adjustedDate);
  const tags = {
    DateTimeOriginal: formattedDate,
    CreateDate: formattedDate,
    ModifyDate: formattedDate,
    FileCreateDate: formattedDate,
    FileModifyDate: formattedDate,
  };
  const latitude = Number(
    metadata.geoDataExif?.latitude ?? metadata.geoData?.latitude,
  );
  const longitude = Number(
    metadata.geoDataExif?.longitude ?? metadata.geoData?.longitude,
  );
  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    (latitude !== 0 || longitude !== 0)
  ) {
    tags.GPSLatitude = latitude;
    tags.GPSLongitude = longitude;
    const altitude = Number(
      metadata.geoDataExif?.altitude ?? metadata.geoData?.altitude,
    );
    if (Number.isFinite(altitude)) tags.GPSAltitude = altitude;
  }
  if (metadata.description) tags.Description = metadata.description;
  if (metadata.title) tags.Title = metadata.title;
  return tags;
}

function destinationDirectory(mediaPath, rules) {
  if (args.maintain_original_dirs)
    return path.join(
      outputDir,
      path.relative(sourceDir, path.dirname(mediaPath)),
    );
  const matchingRule = rules.find((rule) =>
    rule.expression.test(path.basename(mediaPath)),
  );
  return path.join(
    outputDir,
    matchingRule?.directory || args.rule_default_dir || "",
  );
}

function uniqueDestination(destination) {
  if (!fs.existsSync(destination)) return destination;
  const parsed = path.parse(destination);
  let counter = 1;
  let candidate;
  do {
    candidate = path.join(parsed.dir, `${parsed.name}_${counter}${parsed.ext}`);
    counter += 1;
  } while (fs.existsSync(candidate));
  return candidate;
}

async function processMedia(mediaPath, rules) {
  const metadataPath = findMetadataPath(mediaPath);
  if (!metadataPath) {
    if (args.ignore_missing_json) return false;
    throw new Error(`Metadata not found for ${mediaPath}`);
  }
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  const targetDirectory = destinationDirectory(mediaPath, rules);
  fs.mkdirSync(targetDirectory, { recursive: true });
  const destination = uniqueDestination(
    path.join(targetDirectory, path.basename(mediaPath)),
  );
  if (args.move_mode) fs.renameSync(mediaPath, destination);
  else fs.copyFileSync(mediaPath, destination);
  await exiftool.write(destination, metadataTags(metadata, mediaPath), [
    "-overwrite_original",
  ]);
  return true;
}

async function main() {
  const rules = parseRules(args.rule);
  const mediaFiles = collectMediaFiles(sourceDir);
  let processed = 0;
  const missing = [];
  for (const mediaPath of mediaFiles) {
    try {
      if (!(await processMedia(mediaPath, rules))) missing.push(mediaPath);
    } catch (error) {
      await exiftool.end();
      throw error;
    }
    processed += 1;
    const percentage =
      mediaFiles.length === 0
        ? 100
        : Math.round((processed / mediaFiles.length) * 100);
    process.stdout.write(
      `\rProcessed ${processed}/${mediaFiles.length} (${percentage}%)`,
    );
  }
  process.stdout.write("\n");
  if (missing.length > 0) {
    console.log(`Missing metadata for ${missing.length} file(s):`);
    missing.forEach((filePath) => console.log(filePath));
  }
  await exiftool.end();
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
