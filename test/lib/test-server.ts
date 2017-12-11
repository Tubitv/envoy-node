import http from "http";
import grpc from "grpc";

const PROTO_PATH = __dirname + "/test-server.proto";
const helloProto = grpc.load(PROTO_PATH).testServer;
