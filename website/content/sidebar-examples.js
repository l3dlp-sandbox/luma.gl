const sidebars = {
  examplesSidebar: [
    {
      type: 'doc',
      label: 'Overview',
      id: 'index'
    },
    {
      type: 'category',
      label: 'Showcase',
      items: [
        'showcase/instancing',
        'showcase/persistence'
        // 'showcase/postprocessing'
      ]
    },
    {
      type: 'category',
      label: 'API',
      items: [
        'api/animation',
        'api/cubemap'
        // 'api/texture-3d'
      ]
    },
    {
      type: 'category',
      label: 'Tutorials',
      items: [
        'tutorials/hello-triangle',
        'tutorials/hello-cube',
        'tutorials/lighting',
        'tutorials/hello-gltf',
        'tutorials/two-cubes',
        'tutorials/instanced-cubes',
        // 'tutorials/hello-instancing',
        // 'tutorials/shader-modules',
        // 'tutorials/shader-hooks',
        'tutorials/transform-feedback'
        // 'tutorials/transform'
      ]
    }
  ]
};

module.exports = sidebars;
