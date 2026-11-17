export const SAMPLE_SIMPLE = `{
  "name": "My meetup",
  "buildings": {
    "hq": {"name":"HQ","color":"#7cc4ff","walk":{"hq":1,"cafe":4}},
    "cafe": {"name":"Cafe","color":"#ffb066","walk":{"hq":4,"cafe":1}}
  },
  "venues": [
    {"id":"Stage","name":"Stage","building":"hq"},
    {"id":"Cafe","name":"Cafe","building":"cafe"}
  ],
  "sessions": [
    {"title":"Welcome","start":"2026-11-12T09:00:00-07:00","end":"2026-11-12T09:30:00-07:00","venue":"Stage","speakers":["Host"]},
    {"title":"Coffee chat","start":"2026-11-12T09:15:00-07:00","end":"2026-11-12T10:00:00-07:00","venue":"Cafe"}
  ]
}`;
