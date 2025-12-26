#!/bin/bash

workspace=$1
package=untangled-web

if [ -d $workspace ] & [ -d "$workspace/node_modules" ]; then
  echo "Workspace: $(realpath $workspace)"
  bun run build && \
    rm -rf $workspace/node_modules/$package && \
    mv ./dist $workspace/node_modules/$package && \
    echo "Package '$package' locally installed."
else
  echo "Workspace '$workspace' invalid." && exit 1
fi
