window.console = window.console || { log: function () {}, dir: function () {} };

Ext.define('CustomApp', {
    extend: 'Rally.app.TimeboxScopedApp',
    mixins: {
        observable: 'Ext.util.Observable',
        maskable: 'Rally.ui.mask.Maskable'
    },

    scopeType: 'release',
    componentCls: 'app',
    settingsScope: 'workspace',

    config: {
      defaultSettings: {
        storyCardsPerColumn: 5,
        storyCardWidth: 200
      }
    },

    stories: null,
    features: null,
    initiatives: null,


    layout: {
      type: 'vbox',
      align: 'stretch'
    },

    width: '98%',

    constructor: function (config) {
      this.callParent([config]);
      this.mixins.observable.constructor.call(this, config);
      //this.mixins.maskable.constructor.call(this, {maskMsg: 'Loading...'});

      this.addEvents('load');

      this.fidTemplate = Rally.nav.DetailLink;
      this.cardTemplate = new Ext.XTemplate(
        '<tpl if="color != null">',
          '<div class="card {type} state-{state}" style=\'border-top: solid 8px {color}\'>',
        '<tpl else>',
          '<div class="card {type} state-{state} {blocked}">',
        '</tpl>',
          '<p class="name">{fidLink} {name}</p>',
          '<tpl if="size"><p class="size">{size} SP</p></tpl>',
        '</div>'
      );
      this.headerTemplate = new Ext.XTemplate(
        '<div class="header">',
          '<div class="name"><h1>{name} - FEATURE BACKLOG</h1></div>',
          '<div class="info">',
            '{accepted} of {total} Story Points are done. ',
            '{[ values.completed - values.accepted ]} are awaiting approval. ',
            '{[ values.total - values.accepted ]} remaining',
          '</div>',
        '</div>'
      );
    },

    getSettingsFields: function () {
      return [{
        name: 'storyCardsPerColumn',
        label: 'Story Cards per Column',
        xtype: 'rallynumberfield'
      }];
    },

    addContent: function(tb) {
      var me = this;

      me.on('load', function (projects, initiatives, features, stories) {
        console.log('loaded');
        me._onLoad(projects, initiatives, features, stories);
      });

      me.onScopeChange(tb);
    },

    onScopeChange: function (tb) {
      var me = this;
      console.log('Scope changed');

      me.initiatives = null;
      me.features = null;
      me.stories = null;
      me.projects = null;

      me.removeAll(true);
      me.loadData(tb);
    },

    loadData: function (tb) {
      var me = this;

      me.showMask();

      Ext.create('Rally.data.WsapiDataStore', {
        model: 'PortfolioItem/Feature',
        autoLoad: true,
        fetch: ['FormattedID', 'Name', 'Value', 'Parent', 'Project', 'UserStories', 'Children', 'PreliminaryEstimate', 'DirectChildrenCount', 'LeafStoryPlanEstimateTotal'],
        filters: tb.getQueryFilter(),
        sorters: [{
          property: 'Rank',
          direction: 'ASC'
        }],
        listeners: {
          load: me._featuresLoaded,
          scope: me
        }
      });

      Ext.create('Rally.data.WsapiDataStore', {
        model: 'HierarchicalRequirement',
        autoLoad: true,
        fetch: ['FormattedID', 'Name', 'ScheduleState', 'PlanEstimate', 'Feature', 'Parent', 'Project', 'Blocked', 'BlockedReason'],
        filters: [{
          property: 'Feature.Release.Name',
          value: tb.getRecord().get('Name')
        }, {
          property: 'Feature.Release.ReleaseStartDate',
          value: tb.getRecord().raw.ReleaseStartDate
        }, {
          property: 'Feature.Release.ReleaseDate',
          value: tb.getRecord().raw.ReleaseDate
        }, {
          property: 'DirectChildrenCount',
          value: 0
        }],
        sorters: [{
          property: 'Rank',
          direction: 'ASC'
        }],
        listeners: {
          load: me._storiesLoaded,
          scope: me
        }
      });

      Ext.create('Rally.data.WsapiDataStore', {
        model: 'Project',
        autoLoad: true,
        fetch: true,
        listeners: {
          load: me._projectsLoaded,
          scope: me
        }
      });
    },

    _projectsLoaded: function (store, recs, success) {
      var me         = this;

      me.projects    = {};
      me.projectRecs = recs;

      Ext.Array.each(recs, function (elt) {
        me.projects[parseInt(elt.get('ObjectID') + '', 10)] = elt;
      });

      if (me.stories && me.features && me.initiatives && me.projects) {
        me.fireEvent('load', me.projects, me.initiatives, me.features, me.stories);
      }
    },

    _featuresLoaded: function (store, recs, success) {
      var me          = this;
      var initiatives = {};
      var query       = [];
      var filter      = "";

      me.features     = {};
      me.featureRecs  = recs;

      Ext.Array.each(recs, function(elt) {
        if (!elt) {
          return;
        }

        if (elt.get('Parent') && elt.get('Parent')._ref) {
          initiatives[Rally.util.Ref.getOidFromRef(elt.get('Parent')._ref)] = 1;
        }

        me.features[parseInt(elt.get('ObjectID') + '', 10)] = elt;
      });

      Ext.Object.each(initiatives, function(key) {
        query.push({property: 'ObjectID', operator: '=', value: key});
      });

      if (query.length > 0) {
        filter = Rally.data.QueryFilter.or(query);
      } else {
        console.log("No initiatives found", query);
      }

      Ext.create('Rally.data.WsapiDataStore', {
        model: 'PortfolioItem/Initiative',
        autoLoad: true,
        filters: filter,
        fetch: ['FormattedID', 'Name', 'PreliminaryEstimate', 'Value', 'Children', 'Project', 'DisplayColor'],
        sorters: [{
          property: 'Rank',
          direction: 'ASC'
        }],
        listeners: {
          load: me._initiativesLoaded,
          scope: me
        }
      });

      if (me.stories && me.features && me.initiatives && me.projects) {
        me.fireEvent('load', me.projects, me.initiatives, me.features, me.stories);
      }
    },

    _storiesLoaded: function (store, recs, success) {
      var me       = this;

      me.stories   = {};
      me.storyRecs = recs;

      Ext.Array.each(recs, function(elt) {
        me.stories[parseInt(elt.get('ObjectID') + '', 10)] = elt;

      });

      if (me.stories && me.features && me.initiatives && me.projects) {
        me.fireEvent('load', me.projects, me.initiatives, me.features, me.stories);
      }
    },

    _initiativesLoaded: function (store, recs, success) {
      var me            = this;

      me.initiatives    = {};
      me.initiativeRecs = recs;

      Ext.Array.each(recs, function(elt) {
        me.initiatives[parseInt(elt.get('ObjectID') + '', 10)] = elt;
      });

      if (me.stories && me.features && me.initiatives && me.projects) {
        me.fireEvent('load', me.projects, me.initiatives, me.features, me.stories);
      }
    },

    _onLoad: function (projects, initiatives, features, stories) {
      var me = this;

      me.hideMask();
      console.log(me);

      me.projectsByStory      = {};
      me.projectsByFeature    = {};
      me.projectsByInitiative = {};

      me.storyByProject      = {};
      me.featureByProject    = {};
      me.initiativeByProject = {};

      me.totalPoints = 0;
      me.totalCompletedPoints = 0;
      me.totalAcceptedPoints = 0;

      Ext.Object.each(stories, function (oid, story) {
        var featureOid    = Rally.util.Ref.getOidFromRef(story.get('Feature')._ref);
        var initiativeOid = Rally.util.Ref.getOidFromRef(features[featureOid].get('Parent')._ref);
        var projectOid    = Rally.util.Ref.getOidFromRef(story.get('Project')._ref);

        if (story.get('PlanEstimate')) {
          me.totalPoints = me.totalPoints + parseInt(story.get('PlanEstimate') + '', 10);
        }
        if (story.get('ScheduleState') === 'Accepted') {
          me.totalAcceptedPoints = me.totalAcceptedPoints + parseInt(story.get('PlanEstimate') + '', 10);
          me.totalCompletedPoints = me.totalCompletedPoints + parseInt(story.get('PlanEstimate') + '', 10);
        } else if (story.get('ScheduleState') === 'Completed') {
          me.totalCompletedPoints = me.totalCompletedPoints + parseInt(story.get('PlanEstimate') + '', 10);
        }

        oid           = parseInt(oid + '', 10);
        featureOid    = parseInt(featureOid + '', 10);
        initiativeOid = parseInt(initiativeOid + '', 10);
        projectOid    = parseInt(projectOid + '', 10);

        me.projectsByStory[oid]                = me.projectsByStory[oid] || {};
        me.projectsByFeature[featureOid]       = me.projectsByFeature[featureOid] || {};
        me.projectsByInitiative[initiativeOid] = me.projectsByInitiative[initiativeOid] || {};

        me.projectsByStory[oid][projectOid]                = 1;
        me.projectsByFeature[featureOid][projectOid]       = 1;
        me.projectsByInitiative[initiativeOid][projectOid] = 1;

        me.storyByProject[projectOid]      = me.storyByProject[projectOid] || {};
        me.featureByProject[projectOid]    = me.featureByProject[projectOid] || {};
        me.initiativeByProject[projectOid] = me.initiativeByProject[projectOid] || {};

        me.storyByProject[projectOid][oid]                = 1;
        me.featureByProject[projectOid][featureOid]       = 1;
        me.initiativeByProject[projectOid][initiativeOid] = 1;
      });

      me.add({
        xtype: 'box',
        html: me.headerTemplate.apply({
          name: this.getContext().getTimeboxScope().getRecord().get('Name'),
          accepted: me.totalAcceptedPoints,
          completed: me.totalCompletedPoints,
          total: me.totalPoints
        })
      });

      Ext.Object.each(me.storyByProject, function (projectId, stories) {
        console.log('Adding project', projectId, me.projects[projectId].get('Name'));
        me.add(me.addProject(projectId));
      });
    },

    addProject: function (projectId) {
      var me = this;

      var container = Ext.create('Ext.container.Container', {
        layout: {
          type: 'hbox',
          align: 'stretchmax'
        },
        items: [{
          xtype: 'box',
          cls: 'rotate-parent',
          html: '<div class="rotate">' + me.projects[projectId].get('Name') + '</div>'
        }]
      });

      Ext.Array.each(me.initiativeRecs, function (initiative) {
        var initiativeId = initiative.data.ObjectID + '';

        if (me.projectsByInitiative[initiativeId][projectId]) {
          container.add(me.addInitiative(projectId, initiativeId));
        }
      });

      return container;
    },

    addInitiative: function (projectId, initiativeId) {
      var me = this;
      var data = {};
      var iid;

      console.log('Initiative', initiativeId, me.initiatives[initiativeId]);

      data.type    = 'initiative';
      data.name    = me.initiatives[initiativeId].get('Name');
      data.fidLink = me.fidTemplate.getLink({record: me.initiatives[initiativeId].data, text: me.initiatives[initiativeId].get('FormattedID'), showHover: false});

      var container = Ext.create('Ext.container.Container', {
        layout: {
          type: 'vbox',
          align: 'stretch'
        },
        items: [{
          xtype: 'box',
          html: me.cardTemplate.apply(data)
        }]
      });

      var featureContainer = Ext.create('Ext.container.Container', {
        layout: {
          type: 'hbox'
        }
      });

      container.add(featureContainer);

      Ext.Array.each(me.featureRecs, function (feature) {
        var featureId = feature.data.ObjectID;

        if (!me.projectsByFeature[featureId][projectId]) {
          return;
        }

        if (!me.features[featureId].get('Parent')) {
          return;
        }

        iid = Rally.util.Ref.getOidFromRef(me.features[featureId].get('Parent')._ref) + '';

        if (initiativeId === iid) {
          featureContainer.add(me.addFeature(projectId, initiativeId, featureId));
        }
      });

      return container;
    },

    addFeature: function (projectId, initiativeId, featureId) {
      var me      = this;
      var i       = 0;
      var spc     = parseInt(me.getSetting('storyCardsPerColumn') + '', 10);
      var bgColor = me.initiatives[initiativeId].get('DisplayColor');
      var data    = {};
      var storyContainer;
      var storyColumnContainer;

      data.type    = 'feature';
      data.name    = me.features[featureId].get('Name');
      data.size    = me.features[featureId].get('LeafStoryPlanEstimateTotal') || me.features[featureId].get('PreliminaryEstimate').Value;
      data.color   = bgColor;
      data.fidLink = me.fidTemplate.getLink({record: me.features[featureId].data, text: me.features[featureId].get('FormattedID'), showHover: false});

      var container = Ext.create('Ext.container.Container', {
        layout: {
          type: 'vbox',
          align: 'stretch'
        },
        items: [{
          xtype: 'box',
          html: me.cardTemplate.apply(data)
        }]
      });

      storyContainer = Ext.create('Ext.container.Container', {
        layout: {
          type: 'hbox'
        }
      });

      container.add(storyContainer);

      Ext.Array.each(me.storyRecs, function (story) {
        var storyId = story.data.ObjectID;
        var parentId = Rally.util.Ref.getOidFromRef(story.get('Feature')._ref);

        if (!me.projectsByStory[storyId][projectId]) {
          return;
        }

        if (parseInt(featureId + '', 10) !== parseInt(parentId + '', 10)) {
          return;
        }

        if (i >= spc) {
          i = 0;
        }

        if (i === 0) {
          storyColumnContainer = Ext.create('Ext.container.Container', {
            layout: {
              type: 'vbox'
            }
          });

          storyContainer.add(storyColumnContainer);
        }

        storyColumnContainer.add(me.addStory(storyId));
        i++;
      });

      return container;
    },

    addStory: function (storyId) {
      var me   = this;
      var data = {
        name:    me.stories[storyId].get('Name'),
        size:    me.stories[storyId].get('PlanEstimate'),
        state:   ('' + me.stories[storyId].get('ScheduleState')).toLowerCase(),
        type:    'story',
        blocked: me.stories[storyId].get('Blocked') ? 'blocked' :'',

        fidLink: me.fidTemplate.getLink({record: me.stories[storyId].data, text: me.stories[storyId].get('FormattedID'), showHover: false})
      };

      console.log('Story data', data);

      var container = Ext.create('Ext.container.Container', {
        layout: {
          type: 'hbox'
        },
        items: [{
          xtype: 'box',
          html: me.cardTemplate.apply(data)
        }]
      });

      return container;
    }

});
