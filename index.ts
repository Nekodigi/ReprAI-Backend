import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import wordsCount from "words-count";
import { AIRes, Fix, Score, Session, WordCountRes } from "./type";
import { firestore } from "firebase-admin";
import { initializeApp } from "firebase-admin/app";
import session from "express-session";
import { getSession } from "./firestore";
import cors from "cors";

dotenv.config();
const MIN_DELTA = 5;

const app: Express = express();
const port = process.env.PORT || 3000;
const gptToken = process.env.CHAT_GPT_TOKEN;
const sessionSecret = process.env.SESSION_SECRET as string;

initializeApp();
const fs = firestore().collection("reprai");

const openai = new OpenAI({ apiKey: gptToken });

app.use(cors());

async function fix(text: string) {
  const completion = await openai.chat.completions.create({
    frequency_penalty: 1,
    messages: [
      {
        role: "system",
        content:
          "メールの文章として相応しくなるように。分かりにくい箇所、不適切な箇所、文法ミスを修正して。",
      },
      {
        role: "system",
        content:
          "メールの文章として相応しくなるように。文頭に件名、先方の名前を忘れずに",
      },
      // {
      //   role: "user",
      //   content: "先日の発表とても楽しかったです。今度飲みにいきませんか?",
      // },
      // {
      //   role: "assistant",
      //   content:
      //     "先日の発表、大変興味深く拝見させていただきました。お時間がございましたら、近々お会いしてお話しする機会をいただけないでしょうか？飲みに行くこともご一緒いただければ幸いです。\n\nお忙しいところ恐れ入りますが、ご検討いただければ幸いです。",
      // },
      {
        role: "user",
        content: `メールで先方に${text}とメールお送りたい、訂正して`,
      },
    ],
    model: "gpt-4o",
  });
  return completion.choices[0].message.content;
}

async function suggest(text: string) {
  const completion = await openai.chat.completions.create({
    frequency_penalty: 1,
    messages: [
      {
        role: "system",
        content:
          "メールの文章として相応しくなるように。分かりにくい箇所、不適切な箇所、文法ミスを箇条書きで教えて。修正案をすぐ後に提示して。完璧である必要はなし、一般的に合格レベルなら修正は不要。",
      },
      {
        role: "user",
        content: `※次のformat通りのJSONで回答!format:[{"title":"場所や日程が不明確", "fixed":"来週水曜日に上野のカフェに行きませんか?"}]\n\n先日の発表とても楽しかったです。今度食べにいこうぜ?`,
      },
      {
        role: "assistant",
        content: `[{"title":'日程や場所が不明確',"fixed":'来週の水曜日、都合が合えば上野のレストランに行きませんか?'},{"title":'誘い方が適切でない',"fixed":'次回はいつ飲みに行きましょうか？'}]`,
      },
      {
        role: "user",
        content: `※次のformat通りのJSONで回答!format:[{"title":"場所や日程が不明確","fixed":"来週水曜日に上野のカフェに行きませんか?"}]\n\n先日ご提案いただいた次回の会議について、日程調整を進めたいと考えております。以下の日程でご都合をお聞かせいただけますでしょうか。`,
      },
      {
        role: "assistant",
        content: `[]`,
      },
      {
        role: "user",
        content: `※次のformat通りのJSONで回答!修正が必要なければ[]を返す。過剰な修正は不要。format:[{"title":"","fixed":""}] 修正不要なら。:[]\n\n${text}`,
      },
    ],
    model: "gpt-3.5-turbo",
  });
  return completion.choices[0].message.content;
}

async function score(text: string) {
  const completion = await openai.chat.completions.create({
    frequency_penalty: 1,
    messages: [
      {
        role: "system",
        content:
          "JSONで回答してください。メールの文章として文章を丁寧さ、分かりやすさで5段階評価して",
      },
      // {
      //   role: "user",
      //   content: "先日の発表とても楽しかったです。今度飲みにいきませんか?",
      // },
      // {
      //   role: "assistant",
      //   content: "4,5",
      // },
      {
        role: "user",
        content: `format:{"politeness": , "readability": }\n\n${text}`,
      },
    ],
    model: "gpt-3.5-turbo",
  });
  return completion.choices[0].message.content;
}

app.use(session({ secret: sessionSecret }));

const getIfNeed = async (session: Session | undefined, text: string) => {
  let delta_time = MIN_DELTA;
  let result: String | null = "";
  let changed = false;
  if (session != undefined) {
    delta_time = (new Date().getTime() - session.last_updated.getTime()) / 1000;
    result = session.cache_result;
    if (session.last_text != text) {
      changed = true;
    }
    console.log(session, delta_time, "DELTA_TIME", changed);
  }
  if (result === "" || (delta_time >= MIN_DELTA && changed)) {
    let res_fix = (await fix(text)) as string;
    let sug = await suggest(text);
    console.log(sug);
    let res_sug = JSON.parse(sug as string) as Fix[];
    let res_score = JSON.parse((await score(text)) as string) as Score;
    let json_res = {
      fixed: res_fix,
      fixes: res_sug,
      score: res_score,
    } as AIRes;

    console.log(json_res);
    result = JSON.stringify(json_res);
  }
  return result;
};

app.get("/", async (req: Request, res: Response) => {
  const text = req.query.text as string;

  let sid = req.sessionID;
  console.log(req.sessionID);
  let last_state = await getSession(fs, sid);
  let result = await getIfNeed(last_state, text);

  fs.doc("sessions")
    .collection("list")
    .doc(sid)
    .set({
      id: sid,
      last_updated: new Date(),
      last_text: text,
      cache_result: result,
    } as Session);
  res.send(result);
});

app.get("/word_count", async (req: Request, res: Response) => {
  const text = req.query.text as string;
  // character count
  const c_cnt = text.length;

  const w_cnt = wordsCount(text);
  res.send({ w_cnt, c_cnt } as WordCountRes);
});

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
