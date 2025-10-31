import { promises as fs } from 'fs';
import path from 'path';

// --- Configuration ---
// Get sensitive data from Netlify Environment Variables
const YT_API_KEY = process.env.YOUTUBE_API_KEY;
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;

// Define where to save the final data
// This should be inside your "publish" directory
const OUTPUT_DIR = path.resolve(process.cwd(), 'public'); // Assumes your publish dir is 'public'
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'youtube-data.json');

const RESULTS_PER_PAGE = 50;

// --- Helper Functions (from your original script) ---

/**
 * Converts ISO 8601 duration format (e.g., PT1H5M3S) to seconds.
 */
function convertDurationToSeconds(duration) {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  match.shift();
  const [hours, minutes, seconds] = match.map(val => parseInt(val) || 0);
  return hours * 3600 + minutes * 60 + seconds;
}

// --- API Fetching Functions (Optimized) ---

/**
 * Fetches all video IDs from a channel's "uploads" playlist.
 * This is much cheaper (3 units) than using search (100 units).
 */
async function fetchAllVideoIds() {
  const UPLOADS_PLAYLIST_ID = 'UU' + CHANNEL_ID.substring(2);
  let allVideoIds = [];
  let nextPageToken = '';
  console.log('Fetching all video IDs from playlist...');

  try {
    do {
      const url = `https://www.googleapis.com/youtube/v3/playlistItems?key=${YT_API_KEY}&playlistId=${UPLOADS_PLAYLIST_ID}&part=snippet&maxResults=${RESULTS_PER_PAGE}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
      
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        throw new Error(`YouTube API Error: ${data.error.message}`);
      }

      const newVideoIds = data.items.map(item => item.snippet.resourceId.videoId);
      allVideoIds = allVideoIds.concat(newVideoIds);
      nextPageToken = data.nextPageToken;

    } while (nextPageToken);

    console.log(`Found ${allVideoIds.length} video IDs.`);
    return allVideoIds;
  } catch (error) {
    console.error('Error in fetchAllVideoIds:', error);
    throw error;
  }
}

/**
 * Fetches full video details in batches of 50.
 */
async function fetchVideoDetailsInBatches(videoIds) {
  console.log('Fetching details for all videos in batches...');
  let allVideoDetails = [];
  for (let i = 0; i < videoIds.length; i += RESULTS_PER_PAGE) {
    const videoIdBatch = videoIds.slice(i, i + RESULTS_PER_PAGE);
    const videoIdsString = videoIdBatch.join(',');

    const url = `https://www.googleapis.com/youtube/v3/videos?key=${YT_API_KEY}&id=${videoIdsString}&part=contentDetails,snippet`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.items) {
      allVideoDetails = allVideoDetails.concat(data.items);
    }
  }
  console.log(`Fetched details for ${allVideoDetails.length} videos.`);
  return allVideoDetails;
}

// --- Main Execution ---

async function run() {
  if (!YT_API_KEY || !CHANNEL_ID) {
    throw new Error('YOUTUBE_API_KEY and YOUTUBE_CHANNEL_ID must be set in environment variables.');
  }

  try {
    // 1. Fetch all data
    const allVideoIds = await fetchAllVideoIds();
    if (allVideoIds.length === 0) {
      console.log('No videos found.');
      return;
    }
    
    const allVideoDetails = await fetchVideoDetailsInBatches(allVideoIds);

    // 2. Filter the data (same logic as your script)
    const filteredVideos = allVideoDetails
      .filter(video => {
        const duration = video.contentDetails.duration;
        const seconds = convertDurationToSeconds(duration);
        return seconds >= 180;
      })
      .map(item => ({ // Only save the data we actually need
        id: item.id,
        title: item.snippet.title,
        thumbnail: item.snippet.thumbnails.medium.url,
      }));

    // 3. Ensure the output directory exists
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    // 4. Write the final JSON file
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(filteredVideos, null, 2));

    console.log(`Successfully fetched and saved ${filteredVideos.length} videos to ${OUTPUT_FILE}`);

  } catch (error) {
    console.error('Failed to fetch YouTube videos:', error);
    process.exit(1); // Exit with error code to fail the build
  }
}

run();
