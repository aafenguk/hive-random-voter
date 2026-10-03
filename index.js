import hive from "@hiveio/hive-js";

// Configuration
const VOTER = "aafeng";
const RANDOM_NUMBER_OF_POSTS = 5;
const SYSTEM_FETCH_LIMIT = 10;
const RANDOM_VOTE_WEIGHT_DEFAULT = 2; // Default weight to keep VP calculation accurate
const RANDOM_VOTE_WEIGHT_HIGH = 50;   // Weight when VP is above high threshold

const VP_THRESHOLD = 96;
const VP_THRESHOLD_HIGH = 98;

// Time slot window for post eligibility (in seconds)
const VOTING_WINDOW_START = 900;   // 15 minutes
const VOTING_WINDOW_END = 36000;   // 10 hours

// Authors explicitly excluded from random voting (handled by dedicated voter workflows)
const EXCLUDED_AUTHORS = new Set([
  "aafeng",
  "aaronli",
  "abundancelife",
  "acactus1013",
  "ace108",
  "aellly",
  "annepink",
  "atyh",
  "azazqwe",
  "bxt",
  "celeste413",
  "chonodeya",
  "cutehive",
  "dailyke20",
  "deanliu",
  "emmali",
  "graceli",
  "gungunkrishu",
  "gogreenbuddy",
  "itchyfeetdonica",
  "jychbetter",
  "lovequeen",
  "magicmonk",
  "maxwellmarcusart",
  "rivalhw",
  "oflyhigh",
  "susanli3769",
  "victory622",
]);

function getVotingPower(username) {
  return new Promise((resolve, reject) => {
    hive.api.getAccounts([username], function (err, result) {
      if (err) {
        console.error("ERR: getVotingPower", err);
        return reject(err);
      }
      if (!result || result.length === 0) {
        return reject(new Error(`Account ${username} not found.`));
      }
      resolve(result[0].voting_power);
    });
  });
}

function getHotPosts(limit) {
  return new Promise((resolve, reject) => {
    hive.api.getDiscussionsByHot({ limit }, function (err, result) {
      if (err) {
        console.error("ERR: getHotPosts", err);
        return reject(err);
      }
      resolve(result || []);
    });
  });
}

function castVote(voter, wif, author, permlink, votingWeight) {
  return new Promise((resolve, reject) => {
    hive.broadcast.vote(
      wif,
      voter,
      author,
      permlink,
      votingWeight * 100, // Hive API expects weight in basis points (e.g., 50% = 5000)
      function (err, result) {
        if (err) {
          console.error("ERR: castVote", err);
          reject(err);
        } else {
          console.log(`Voted ${votingWeight}% on ${author}/${permlink}`);
          resolve(result);
        }
      }
    );
  });
}

async function randomVote(voter, wif) {
  const currentVP = await getVotingPower(voter);
  
  let votingWeight = RANDOM_VOTE_WEIGHT_DEFAULT;
  if (currentVP > VP_THRESHOLD * 100 && currentVP <= VP_THRESHOLD_HIGH * 100) {
    console.log(`VP is in normal range (${(currentVP / 100).toFixed(2)}%).`);
  } else if (currentVP > VP_THRESHOLD_HIGH * 100) {
    console.log(`VP is high (${(currentVP / 100).toFixed(2)}%). Increasing vote weight.`);
    votingWeight = RANDOM_VOTE_WEIGHT_HIGH;
  }

  console.log("Loading hot posts...");
  const posts = await getHotPosts(SYSTEM_FETCH_LIMIT);
  const now = Date.now();

  for (let i = 0; i < Math.min(posts.length, RANDOM_NUMBER_OF_POSTS); i += 1) {
    const post = posts[i];
    const { author, permlink, created, active_votes } = post;

    // Skip authors that are in the exclusion list
    if (EXCLUDED_AUTHORS.has(author)) {
      console.log(`Skipping excluded author: ${author}`);
      continue;
    }

    // Check post age eligibility
    const createdTime = Date.parse(created);
    const ageInSeconds = Math.abs(now - createdTime) / 1000;

    if (ageInSeconds < VOTING_WINDOW_START || ageInSeconds > VOTING_WINDOW_END) {
      console.log(`Post not in time window (${Math.round(ageInSeconds)}s old), bypassing: ${author}/${permlink}`);
      continue;
    }

    // Check if account has already voted on this post
    const hasVoted = active_votes.some(v => v.voter === voter);

    if (!hasVoted) {
      await castVote(voter, wif, author, permlink, votingWeight);
      break; // Vote once per execution cycle
    } else {
      console.log(`Already voted on: ${author}/${permlink}`);
    }
  }

  console.log("--- Execution Completed ---");
}

async function run() {
  const wif = process.env.AAFENG_HIVE_POSTING_KEY;

  if (!wif) {
    console.error("AAFENG_HIVE_POSTING_KEY environment variable is missing.");
    process.exitCode = 1;
    return;
  }

  try {
    await randomVote(VOTER, wif);
  } catch (err) {
    console.error("Failed during random vote execution:", err);
    process.exitCode = 1;
  }
}

run();