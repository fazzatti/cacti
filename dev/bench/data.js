window.BENCHMARK_DATA = {
  "lastUpdate": 1716918953668,
  "repoUrl": "https://github.com/fazzatti/cacti",
  "entries": {
    "Benchmark": [
      {
        "commit": {
          "author": {
            "email": "sandeep.nishad1@ibm.com",
            "name": "Sandeep Nishad",
            "username": "sandeepnRES"
          },
          "committer": {
            "email": "petermetz@users.noreply.github.com",
            "name": "Peter Somogyvari",
            "username": "petermetz"
          },
          "distinct": false,
          "id": "6994e5b7a43b4f3e06535babb17edd466c4d4abc",
          "message": "fix(weaver-go-sdk): revert fabric-protos-go-apiv2 dep to fabric-protos-go\n\n    * Added a script to manually change go package names inside fabric-protos\n      to fabric-protos-go-apiv2 (for future migration apiv2).\n    * Added more unit and build tests covering all go modules\n    * Added tools/go-mod-tidy.sh script to fix go.mod by running go mod tidy\n\nSigned-off-by: Sandeep Nishad <sandeep.nishad1@ibm.com>",
          "timestamp": "2024-05-24T12:02:26-07:00",
          "tree_id": "d362d441cc6cadaf31b7851a6c4578c64fe3adcd",
          "url": "https://github.com/fazzatti/cacti/commit/6994e5b7a43b4f3e06535babb17edd466c4d4abc"
        },
        "date": 1716918951416,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "cmd-api-server_HTTP_GET_getOpenApiSpecV1",
            "value": 580,
            "range": "±1.66%",
            "unit": "ops/sec",
            "extra": "177 samples"
          },
          {
            "name": "cmd-api-server_gRPC_GetOpenApiSpecV1",
            "value": 358,
            "range": "±1.45%",
            "unit": "ops/sec",
            "extra": "180 samples"
          }
        ]
      }
    ]
  }
}