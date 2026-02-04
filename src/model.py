#!/usr/bin/python
import pandas as pd
import numpy as np
import sys

from sklearn.linear_model import LinearRegression
from sklearn.linear_model import Ridge
from sklearn.linear_model import RidgeCV
from sklearn.linear_model import Lasso
from sklearn.linear_model import LassoCV
from sklearn.linear_model import SGDRegressor
from sklearn.linear_model import LogisticRegression
from sklearn.linear_model import LogisticRegressionCV
from sklearn.neighbors import KNeighborsRegressor
from sklearn.neighbors import KNeighborsClassifier
from sklearn.linear_model import PassiveAggressiveClassifier
from sklearn.linear_model import RidgeClassifier
from sklearn.linear_model import RidgeClassifierCV
from sklearn.linear_model import SGDClassifier
from sklearn.naive_bayes import GaussianNB
from sklearn.naive_bayes import MultinomialNB
from sklearn.tree import DecisionTreeRegressor
from sklearn.tree import DecisionTreeClassifier
from sklearn.svm import SVC
from sklearn.svm import LinearSVR
from sklearn.svm import LinearSVC
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.feature_extraction.text import TfidfTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.model_selection import train_test_split
from sklearn.linear_model import Perceptron
from sklearn.linear_model import ElasticNet
from sklearn.linear_model import ElasticNetCV
from sklearn.linear_model import Lars
from sklearn.linear_model import LarsCV
from sklearn.linear_model import LassoLars
from sklearn.linear_model import LassoLarsCV
from sklearn.linear_model import LassoLarsIC
from sklearn.linear_model import OrthogonalMatchingPursuit
from sklearn.linear_model import OrthogonalMatchingPursuitCV
from sklearn.linear_model import ARDRegression
from sklearn.linear_model import BayesianRidge
from sklearn.linear_model import MultiTaskElasticNet
from sklearn.linear_model import MultiTaskElasticNetCV
from sklearn.linear_model import MultiTaskLasso
from sklearn.linear_model import MultiTaskLassoCV
from sklearn.linear_model import HuberRegressor
from sklearn.linear_model import RANSACRegressor
from sklearn.linear_model import TheilSenRegressor
from sklearn.linear_model import PoissonRegressor
from sklearn.linear_model import TweedieRegressor
from sklearn.linear_model import GammaRegressor
from sklearn.naive_bayes import BernoulliNB
from sklearn.naive_bayes import CategoricalNB
from sklearn.naive_bayes import ComplementNB
from sklearn.neighbors import RadiusNeighborsClassifier
from sklearn.neighbors import RadiusNeighborsRegressor
from sklearn.neighbors import NearestCentroid
from sklearn.neural_network import BernoulliRBM
from sklearn.neural_network import MLPClassifier
from sklearn.neural_network import MLPRegressor
from sklearn.svm import NuSVC
from sklearn.svm import NuSVR
from sklearn.svm import SVR
from sklearn.tree import ExtraTreeClassifier
from sklearn.tree import ExtraTreeRegressor

from config import Config
from train import Train
import argparse
import json
#import mysql.connector

class Model:
	def __init__(self,header_id,training_id,csv_file_name,input_col,target_col,model_name,model_params):
		self.header_id = ''.join(map(str,header_id))
		self.training_id = ''.join(map(str,training_id))
		self.csv_file_name = ''.join(map(str,csv_file_name))
		self.input_col = input_col
		self.target_col = target_col
		self.model_name = ''.join(map(str,model_name))
		self.model_params = json.loads(model_params.replace('$','"'))


	#list of models to evaluate
	def get_models(self):
		model_invalid = "Invalid model"
		csv_file_name = Config.CSV_CONFIG
		df = pd.read_csv(csv_file_name)
		row = df[df['MODEL_NAME'] == self.model_name]
		if row.empty:
			raise ValueError(
				f"Model '{self.model_name}' not found in model table. "
				f"Available models: {df['MODEL_NAME'].tolist()}"
			)
		model_class = row['MODEL_CLASS'].values[0]
		if model_class in globals():
			klass = globals()[model_class]
			instance = klass(**self.model_params)
			try:
				Train(self.header_id,self.training_id,self.csv_file_name,self.input_col,self.target_col,instance,self.model_name)
			except FileNotFoundError as fne:
				print(fne)
		else:
			return model_invalid
	#check params
	def check_params(self):
		for key in self.model_params.keys():
			if self.model_params[key] == 'True':
				self.model_params[key] = True
			elif self.model_params[key] == 'False':
				self.model_params[key]= False
			elif self.model_params[key] == 'None':
				self.model_params[key] = None
			elif key == 'Cs' or key == 'n_neighbors' or key == 'n_iter' or key == 'n_nonzero_coefs' or key == 'max_iter' or key == 'n_alphas' or key == 'hidden_layer_sizes':
				self.model_params[key] = int(self.model_params[key])
			elif key == 'alphas':
				array = np.array([x for x in [self.model_params[key]]])
				self.model_params[key] = np.asfarray(array,float)
			else:
				try:
					self.model_params[key] = float(self.model_params[key])
				except ValueError:
					self.model_params[key] = self.model_params[key]

if __name__ == "__main__":
	parser = argparse.ArgumentParser(description='')
	
	requiredNamed = parser.add_argument_group('required arguments')
	requiredNamed.add_argument('--header_id', type = str, nargs='+',
						help='header id')
	requiredNamed.add_argument('--training_id', type = str, nargs='+',
						help='training id')
	requiredNamed.add_argument('--csv_file_name', type= str, nargs='+',
						help='csv filename')
	requiredNamed.add_argument('--input_col',nargs='+',
						help='input columns for train phase')
	requiredNamed.add_argument('--target_col',nargs='+',
						help='target column for train phase')
	requiredNamed.add_argument('--model_name',type= str, nargs='+',
						help='target column for train phase',required=True)
	requiredNamed.add_argument('--model_params', type=str,
						help='target column for train phase',required=True)				

	args = parser.parse_args()
	model = Model(args.header_id,args.training_id,args.csv_file_name,args.input_col,args.target_col,args.model_name,args.model_params)
	model.check_params()
	model.get_models()

