const { MongoClient } = require('mongodb');

const URI = 'mongodb+srv://ASO:VLClwDRj85KpbNy1@cluster0.q2c28v8.mongodb.net/test?appName=Cluster0';
const OLD = 'http://localhost:4000';
const NEW = 'https://aso-trmg.onrender.com';

MongoClient.connect(URI).then(async (client) => {
  const db = client.db('test');

  const p = await db.collection('products').updateMany(
    { imageUrls: { $regex: 'localhost' } },
    [{ $set: { imageUrls: {
      $map: {
        input: '$imageUrls',
        as: 'u',
        in: { $replaceAll: { input: '$$u', find: OLD, replacement: NEW } }
      }
    }}}]
  );

  const b = await db.collection('businesses').updateMany(
    { logoUrl: { $regex: 'localhost' } },
    [{ $set: { logoUrl: {
      $replaceAll: { input: '$logoUrl', find: OLD, replacement: NEW }
    }}}]
  );

  console.log('Products fixed:', p.modifiedCount);
  console.log('Businesses fixed:', b.modifiedCount);
  await client.close();
  console.log('Done!');

}).catch(console.error);