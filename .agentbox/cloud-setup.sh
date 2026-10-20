#!/bin/sh
# What a cloud run of this project needs that the sandbox image lacks.
# zip: scripts/cloud-gateway-setup.mjs packs the cloud server with it, and a test runs that.
command -v zip >/dev/null 2>&1 || { sudo apt-get update -qq && sudo apt-get install -y -qq zip; }
