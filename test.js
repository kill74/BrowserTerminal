import http from 'http';

http.get('http://localhost:3000/api/iframe-proxy?url=https://www.bing.com/search?q=youtube.com', (res) => {
  console.log(`STATUS: ${res.statusCode}`);
  console.log(`HEADERS: ${JSON.stringify(res.headers)}`);
  res.setEncoding('utf8');
  let rawData = '';
  res.on('data', (chunk) => { rawData += chunk; });
  res.on('end', () => {
    console.log(`BODY LENGTH: ${rawData.length}`);
    console.log(`BODY START: ${rawData.substring(0, 200)}`);
  });
}).on('error', (e) => {
  console.error(`Got error: ${e.message}`);
});
