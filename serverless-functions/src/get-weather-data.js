require('dotenv').config();
const axios = require('axios');
const darkskyAPI = `https://api.darksky.net/forecast/${process.env.DARKSKI_API_KEY}/`;

exports.handler = (event, context, callback) => {

  let lat = event.queryStringParameters['lat'];
  let lon = event.queryStringParameters['lon'];
  let darkskyLocationParam = `${lat},${lon}`;

  let apiUrls = [
    darkskyAPI + darkskyLocationParam
  ];

  Promise.all(apiUrls.map( url =>
    axios.get(url)
      .then(checkStatus)
      .catch(logError)
  ))
  .then(res => {

    let dataToReturn = {
      darksky : res[0].data,
    };

    callback(null, {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin' : '*'
      },
      body: JSON.stringify(dataToReturn)
    })
  });

// ------------------------------------------
//  HELPER FUNCTIONS
// ------------------------------------------

  function checkStatus(response) {
    if (response.status === 200) {
      return Promise.resolve(response);
    } else {
      return Promise.reject(new Error(response.statusText));
    }
  }

  function logError(err) {
   console.log('There was a problem!', err);
  }

};

