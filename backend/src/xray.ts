import * as AWSXRay from 'aws-xray-sdk';

// Configure X-Ray
AWSXRay.setDaemonAddress(process.env.XRAY_DAEMON_ADDRESS || 'localhost:2000');

// Capture all outgoing HTTP/HTTPS requests
AWSXRay.captureHTTPsGlobal(require('http'));
AWSXRay.captureHTTPsGlobal(require('https'));

// Capture promises for async context
AWSXRay.capturePromise();

// Set context missing strategy - log instead of throwing in development
if (process.env.NODE_ENV !== 'production') {
  AWSXRay.setContextMissingStrategy('LOG_ERROR');
}

export { AWSXRay };
