process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = '0';

var fs         = require('fs');
var _          = require('underscore');
var async      = require('async');
var https      = require('https');
var http       = require('http');
var flat       = require('flat');
var jsRemover  = require('js-remove-property');

var kubernetesProtocol = process.env['FALKONRY_K8_PROTOCOL'];
var kubernetesHost     = process.env['FALKONRY_K8_HOST'];
var kubernetesPort     = parseInt(process.env['FALKONRY_K8_PORT']);
var kubernetesToken    = null;
var kubeletPort        = parseInt(process.env['FALKONRY_KUBELET_PORT']);
var metricsInterval    = parseInt(process.env['FALKONRY_METRICS_INTERVAL']);

if(fs.existsSync("/var/run/secrets/kubernetes.io/serviceaccount/token")) {
  kubernetesToken = fs.readFileSync('/var/run/secrets/kubernetes.io/serviceaccount/token');
} else{
  kubernetesToken = process.env['FALKONRY_K8_TOKEN'];
}

var _GET = function(protocol, host, port, path, headers, done){
  var options = {
    host: host,
    port: port,
    path: path,
    headers: headers,
    method: 'GET'
  };

  protocol = (protocol === 'https' ? https : http);

  var request = protocol.request(options, function(response) {
    var result = '';
    var responseCode = response.statusCode;

    response.on('data', function(data) {
      result += data;
    });

    response.on('end', function() {
      if(responseCode != 200){
        if(result == '')
          result = 'Internal Server Error';
        return done(result, null);
      }else
        return done(false, result);
    });
  });

  request.on('error', function(error){
  	if(!error)
  		error = 'Error sending request';
    return done(error, null);
  });

  request.end();
};

var logMetrics = function() {
	var headers = {'Content-Type': 'application/json'};
	if(kubernetesToken)
		headers['Authorization'] = 'Bearer '+kubernetesToken;
	return _GET(kubernetesProtocol, kubernetesHost, kubernetesPort, '/api/v1/nodes', headers, function(err, resp){
		if(err) {
			console.log(new Date().toString() + ' ERROR Error fetching nodes: '+err);
			return setTimeout(function(){
				return logMetrics();
			}, 10000);
		} else {
			var nodes = JSON.parse(resp).items;
			return async.parallel(function(){
				var tasks = [];
				var fn = function(nodeName){
				return function(_cb) {
					return _GET('http', kubernetesHost, kubernetesPort, '/api/v1/proxy/nodes/' + nodeName + ':' + kubeletPort + '/stats/summary', headers,  function(err, resp){
						if(err) {
							console.log(new Date().toString() + ' ERROR Error fetching metrics from node [' + nodeName + '] : '+err);
						} else {		
							var obj = JSON.parse(resp);
				         	
				         	var flattened_node_props = flat(obj.node);
							flattened_node_props['logType'] = 'kube_stats';
							console.log(JSON.stringify(flattened_node_props));

							if(Array.isArray(obj.pods)) {
								obj.pods.forEach(function(eachPod){
									var flattened_pod_props = flat(eachPod);
									flattened_pod_props['nodeName'] = nodeName;
									flattened_pod_props['logType'] = 'kube_stats';
									console.log(JSON.stringify(flattened_pod_props));
								});
							}							   
						}
						return _cb(null, null);
						});
					}
				};

				nodes.forEach(function(eachNode){
					tasks.push(fn(eachNode.metadata.name));
				});
				return tasks;

			}(), function(err, resp){
				return setTimeout(function(){
					return logMetrics();
				}, metricsInterval);
			});
		}
	});
};

var start = function() {
	return logMetrics();
};

start();
