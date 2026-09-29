# Yet another Google Photos takeout tool

A tool to help you manage your Google Photos takeout data

## Features

- Extract information from JSON metadata and include it as Exif metadata in the corresponding media files
- Organize and sort your takeout data into a more manageable folder structure

> [!TIP]
> This tool does not deal with unextracted takeout.zip / takeout.tar.gz files. Extract them into a directory first using 7-zip or similar, and in case you have multiple takeout archives, merge them into a single directory. If you have stable internet, it is the easiest to select 50GB as the maximum archive size when requesting the takeout, so you can download it in a single archive, but you might end up with multiple archives regardless if you have a lot of data.

## Examples

```bash
# Only add Exif metadata to the media files and leave the original directory structure intact. Ignore the Trash and Stickers directories.
node index.js --input /path/to/takeout --output /path/to/output --ignore Trash --ignore Stickers --maintain-original-dirs

# Add Exif metadata to the media files and sort them into subdirectories based on filename regex rules. Files that don't match any rule will be placed in the "Unsorted" directory. Enable move mode to save time and disk space.
node index.js --input /path/to/takeout --output /path/to/output --rule '/screenshot/i=Screenshots' --rule '/^IMG\_\d+=Camera' --rule-default-dir 'Unsorted' --move-mode

# Similar to above, but also correct the timestamps in the Exif metadata based on your timezone if needed (UTC+2, CEST in this case) and try to extract the timestamp from the filename if available.
node index.js --input /path/to/takeout --output /path/to/output --rule "/screenshot/i=Screenshots" --rule-default-dir 'Camera' --move-mode --ignore Trash --ignore Stickers --utc-time-shift 2 --try-time-filename
```

## Available options

| Option                   | Description                                                                                                                                                                                                                                                                | Example                                                       | Required | Unique | Note                                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | -------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| --input                  | Path to the input directory                                                                                                                                                                                                                                                | --input /path/to/takeout                                      | ✅       | ✅     | It does not matter if you point this at "Takeout" or its subdirectory "Google Photos", it is browsed recursively                                                |
| --output                 | Path to the output directory                                                                                                                                                                                                                                               | --output /path/to/output                                      | ✅       | ✅     |
| --utc-time-shift         | How many hours ahead (positive) or behind (negative) UTC your timezone is. This is used to correct the timestamps in the Exif metadata.                                                                                                                                    | --utc-time-shift -5 # For EST (UTC-5)                         | ❌       | ✅     | If not specified, the UTC timezone will be used, so using this is highly recommended                                                                            |
| --try-time-filename      | Instead of extracting the timestamp from the JSON metadata, extract it from the filename. This is useful if your country has daylight saving time changes, or your photos are from all over the world. If it is not found in the filename, the metadata time will be used. | --try-time-filename                                           | ❌       | ✅     | As the time in the filename was the current time when the photo was taken, utc time shift will not be used in cases where the time is available in the filename |
| --move-mode              | Move files instead of copying them - riskier, but faster and saves disk space                                                                                                                                                                                              | --move-mode                                                   | ❌       | ✅     |
| --ignore                 | Name of a directory to ignore                                                                                                                                                                                                                                              | --ignore Trash --ignore Stickers                              | ❌       | ❌     |
| --maintain-original-dirs | Maintain the original directory structure of the takeout data and do not merge them                                                                                                                                                                                        | --maintain-original-dirs                                      | ❌       | ✅     |
| --rule                   | A filename regex rule to sort files into subdirectories                                                                                                                                                                                                                    | --rule '/screenshot/i=Screenshots' --rule '/^IMG\_\d+=Camera' | ❌       | ❌     | ⚠️ Can't be used with --maintain-original-folders                                                                                                               |
| --rule-default-dir       | The default directory for files that don't match any rule                                                                                                                                                                                                                  | --rule-default-dir 'Unsorted'                                 | ❌       | ✅     | ⚠️ Can't be used without any --rule                                                                                                                             |
| --ignore-missing-json    | Instead of throwing an error when a corresponsing JSON metadata file is missing, just ignore it, continue processing and print affected files at the end                                                                                                                   | --ignore-missing-json                                         | ❌       | ✅     |
