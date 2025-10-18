require('dotenv').config();
const net = require('net');

process.on('uncaughtException', (err) => {
  console.error(err);
});

// Dynamically detect how many pools are defined
const pools = [];
let i = 1;

while (process.env[`REMOTE_HOST_${i}`]) {
  const pool = {
    remoteHost: process.env[`REMOTE_HOST_${i}`],
    remotePort: parseInt(process.env[`REMOTE_PORT_${i}`], 10),
    remotePassword: process.env[`REMOTE_PASSWORD_${i}`],
    localHost: process.env[`LOCAL_HOST_${i}`] || '0.0.0.0',
    localPort: parseInt(process.env[`LOCAL_PORT_${i}`], 10) || 80,
  };

  if (
    !pool.remoteHost ||
    !pool.remotePort ||
    !pool.remotePassword ||
    !pool.localHost ||
    !pool.localPort
  ) {
    console.error(`Error: Invalid config for pool #${i}`);
    process.exit(1);
  }

  pools.push(pool);
  i++;
}

// Create a server for each pool
pools.forEach((pool, index) => {
  const server = net.createServer((localsocket) => {
    const remotesocket = new net.Socket();

    remotesocket.connect(pool.remotePort, pool.remoteHost);

    localsocket.on('connect', () => {
      console.log(`[Pool ${index + 1}] Connected: ${localsocket.remoteAddress}:${localsocket.remotePort}`);
    });

    localsocket.on('data', (data) => {
      console.log(`[Pool ${index + 1}] From local: ${data}`);
      const flushed = remotesocket.write(data);
      if (!flushed) localsocket.pause();
    });

    remotesocket.on('data', (data) => {
      console.log(`[Pool ${index + 1}] From remote: ${data}`);
      const flushed = localsocket.write(data);
      if (!flushed) remotesocket.pause();
    });

    localsocket.on('drain', () => remotesocket.resume());
    remotesocket.on('drain', () => localsocket.resume());

    localsocket.on('close', () => {
      console.log(`[Pool ${index + 1}] Closing remote`);
      remotesocket.end();
    });

    remotesocket.on('close', () => {
      console.log(`[Pool ${index + 1}] Closing local`);
      localsocket.end();
    });
  });

  server.listen(pool.localPort, pool.localHost, () => {
    console.log(`[Pool ${index + 1}] Redirecting ${pool.localHost}:${pool.localPort} => ${pool.remoteHost}:${pool.remotePort}`);
  });
});
